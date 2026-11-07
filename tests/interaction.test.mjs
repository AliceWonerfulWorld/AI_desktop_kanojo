import assert from 'node:assert/strict'
import test from 'node:test'
import { PointerGesture } from '../src/interaction/pointer-gesture.ts'
import { chooseResponse } from '../src/interaction/responses.ts'
import { InteractionRenderer } from '../src/renderer/src/interaction/interaction-renderer.ts'
import { GreetingPresenter } from '../src/renderer/src/dialogue/greeting.ts'
import { FakeClock } from './helpers/fake-clock.mjs'

const point = (extra = {}) => ({
  pointerId: 1,
  button: 0,
  clientX: 50,
  clientY: 50,
  screenX: 100,
  screenY: 100,
  ...extra,
})
function gesture(native = async () => 'click') {
  const calls = []
  const input = new PointerGesture({
    hitTest: (x, y) => x > 0 && y > 0,
    startDrag: () => calls.push('start'),
    cancelDrag: () => calls.push('cancel'),
    finishDrag: () => {
      calls.push('end')
      return native()
    },
  })
  return { input, calls }
}
function presentation(random = () => 0) {
  const clock = new FakeClock()
  const view = { hidden: true, textContent: '' }
  const bubble = new GreetingPresenter(view, clock)
  const visuals = []
  const events = []
  let released = 0
  const base = {
    setState: async (state) => {
      visuals.push({ ...state })
      return {
        state,
        applied: true,
        assetId: 'test',
        fallback: false,
        unavailable: [],
      }
    },
    hitTest: () => true,
    dispose: () => {
      released++
    },
  }
  const renderer = new InteractionRenderer(
    base,
    bubble,
    clock,
    random,
    (event) => events.push(event),
  )
  return {
    renderer,
    bubble,
    clock,
    view,
    visuals,
    events,
    released: () => released,
  }
}

test('short opaque left click is accepted once; extra pointerup/click cannot repeat it', async () => {
  const { input, calls } = gesture()
  assert.equal(input.begin(point()), true)
  assert.equal(await input.end(point()), true)
  assert.equal(await input.end(point()), false)
  assert.deepEqual(calls, ['start', 'end'])
})

test('transparent pixels, right button and mismatched pointer never interact', async () => {
  const { input, calls } = gesture()
  assert.equal(input.begin(point({ clientX: -1 })), false)
  assert.equal(input.begin(point({ button: 2 })), false)
  assert.equal(await input.end(point()), false)
  assert.deepEqual(calls, [])
  input.begin(point())
  assert.equal(await input.end(point({ pointerId: 2 })), false)
  assert.equal(await input.end(point({ clientX: -1 })), false)
})

test('drag excursions remain a drag after returning to the start; window clamp cannot turn drag into click', async () => {
  const { input } = gesture()
  input.begin(point())
  input.move(point({ screenX: 106 }))
  input.move(point())
  assert.equal(await input.end(point()), false)
  const nativeMoved = gesture(async () => 'drag')
  nativeMoved.input.begin(point())
  assert.equal(await nativeMoved.input.end(point()), false)
})

test('screen coordinates ignore window-origin changes; release displacement vetoes a very fast drag', async () => {
  const { input } = gesture()
  input.begin(point())
  input.move(point({ clientX: 5 }))
  assert.equal(await input.end(point({ clientX: 5 })), true)
  input.begin(point())
  assert.equal(await input.end(point({ screenX: 110 })), false)
})

test('blur/cancel/dispose and cancelled native sessions suppress delayed click replies', async () => {
  let resolve
  const pending = new Promise((done) => {
    resolve = done
  })
  const { input } = gesture(() => pending)
  input.begin(point())
  const finishing = input.end(point())
  assert.equal(input.begin(point()), false)
  input.cancel()
  resolve('click')
  assert.equal(await finishing, false)
  input.begin(point())
  input.dispose()
  assert.equal(await input.end(point()), false)
  assert.equal(input.begin(point()), false)
  const cancelled = gesture(async () => 'cancelled')
  cancelled.input.begin(point())
  assert.equal(await cancelled.input.end(point()), false)
})

test('failed native completion fails closed and releases the gesture', async () => {
  const { input, calls } = gesture(async () => {
    throw new Error('closed')
  })
  input.begin(point())
  assert.equal(await input.end(point()), false)
  assert.ok(calls.includes('cancel'))
  assert.equal(input.begin(point()), true)
})

test('each behavior has three distinct short responses; sleep stays sleepy and no intimacy expressions are used', () => {
  for (const action of ['idle', 'reading', 'resting', 'sleeping']) {
    const chosen = [0, 0.4, 0.99].map((value) =>
      chooseResponse(action, () => value),
    )
    assert.equal(new Set(chosen.map((entry) => entry.id)).size, 3)
    assert.ok(chosen.every((entry) => entry.text.length < 40))
    assert.ok(
      chosen.every(
        (entry) => !['shy', 'affectionate'].includes(entry.expression),
      ),
    )
    if (action === 'sleeping')
      assert.ok(chosen.every((entry) => entry.expression === 'sleepy'))
    assert.notEqual(
      chooseResponse(action, () => 0, chosen[0].id).id,
      chosen[0].id,
    )
  }
})

test('one accepted click shows one response, spam does not prolong or multiply it, and expression restores', async () => {
  const { renderer, clock, view, visuals, events } = presentation()
  await renderer.setState({ action: 'idle', expression: 'neutral' })
  assert.equal(renderer.react().expression, 'smile')
  for (let i = 0; i < 100; i++) assert.equal(renderer.react(), null)
  assert.equal(events.length, 1)
  assert.equal(clock.pending.size, 2)
  clock.advance(2999)
  assert.equal(view.hidden, false)
  assert.equal(visuals.at(-1).expression, 'smile')
  clock.advance(1)
  assert.equal(view.hidden, true)
  assert.equal(visuals.at(-1).expression, 'neutral')
  assert.equal(clock.pending.size, 0)
  renderer.react()
  assert.equal(events.length, 2)
  assert.notEqual(events[0].id, events[1].id)
  renderer.dispose()
})

test('restoration uses the latest base state; changing behavior clears an outdated reaction', async () => {
  const { renderer, clock, visuals, view } = presentation()
  await renderer.setState({ action: 'reading', expression: 'neutral' })
  renderer.react()
  await renderer.setState({ action: 'reading', expression: 'surprised' })
  assert.equal(visuals.at(-1).expression, 'smile')
  clock.advance(3000)
  assert.equal(visuals.at(-1).expression, 'surprised')
  renderer.react()
  await renderer.setState({ action: 'sleeping', expression: 'sleepy' })
  clock.advance(10000)
  assert.deepEqual(visuals.at(-1), { action: 'sleeping', expression: 'sleepy' })
  assert.equal(view.hidden, true)
  renderer.dispose()
})

test('sleeping responses never wake behavior and are limited to one per fifteen seconds', async () => {
  const { renderer, clock, visuals, events } = presentation()
  await renderer.setState({ action: 'sleeping', expression: 'sleepy' })
  renderer.react()
  clock.advance(14999)
  assert.equal(renderer.react(), null)
  clock.advance(1)
  assert.equal(renderer.react().action, 'sleeping')
  assert.equal(events.length, 2)
  assert.ok(
    visuals.every(
      (state) => state.action === 'sleeping' && state.expression === 'sleepy',
    ),
  )
  renderer.dispose()
})

test('passive greetings cannot overwrite a reaction and cancellation/disposal clears pending work', async () => {
  const { renderer, bubble, clock, view, visuals, released } = presentation()
  await renderer.setState({ action: 'resting', expression: 'neutral' })
  bubble.show('startup')
  renderer.react()
  const reactionText = view.textContent
  assert.equal(bubble.show('passive resume'), false)
  assert.equal(view.textContent, reactionText)
  renderer.cancelReaction()
  assert.equal(view.hidden, true)
  assert.equal(clock.pending.size, 0)
  const before = visuals.length
  renderer.dispose()
  renderer.dispose()
  clock.advance(100000)
  assert.equal(visuals.length, before)
  assert.equal(renderer.react(), null)
  assert.equal(renderer.hitTest(50, 50), false)
  assert.equal(released(), 1)
})
