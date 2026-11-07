import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSettingsPatch } from '../src/shared/presentation.ts'
import { defaultMemory, validateMemory } from '../src/shared/memory-state.ts'
import { scaledBounds } from '../src/main/window-bounds.ts'
import { createPresentationPause } from '../src/behavior/presentation-pause.ts'
import { BehaviorEngine } from '../src/behavior/behavior-engine.ts'
import { GreetingPresenter } from '../src/renderer/src/dialogue/greeting.ts'
import { FakeClock } from './helpers/fake-clock.mjs'

test('settings patches allow bounded scale and known booleans only', () => {
  assert.deepEqual(
    validateSettingsPatch({ scale: 0.5, paused: true, showOnStartup: false }),
    { scale: 0.5, paused: true, showOnStartup: false },
  )
  for (const bad of [
    null,
    [],
    { scale: NaN },
    { scale: 0.49 },
    { scale: 2.1 },
    { paused: 'true' },
    { alwaysOnTop: null },
    { affection: 100 },
    { windowBounds: {} },
    { file: '/tmp/data' },
  ])
    assert.throws(() => validateSettingsPatch(bad))
})
test('existing version-one saves gain defaults without losing relationship or settings', () => {
  const old = defaultMemory()
  old.affection = 70
  old.relationshipStage = 'close'
  old.settings.alwaysOnTop = false
  delete old.settings.showOnStartup
  delete old.settings.paused
  const result = validateMemory(old)
  assert.equal(result.affection, 70)
  assert.equal(result.settings.alwaysOnTop, false)
  assert.equal(result.settings.showOnStartup, true)
  assert.equal(result.settings.paused, false)
})
test('scale preserves feet and center when space permits and fits smaller work areas', () => {
  const original = { x: 500, y: 500, width: 340, height: 580 }
  const area = { x: 0, y: 0, width: 2000, height: 1600 }
  for (const scale of [0.5, 1, 2]) {
    const bounds = scaledBounds(original, area, scale)
    assert.equal(bounds.y + bounds.height, 1080)
    assert.equal(bounds.x + bounds.width / 2, 670)
    assert.equal(bounds.height - 112, 468 * scale)
  }
  const small = { x: -240, y: 40, width: 240, height: 300 }
  assert.deepEqual(scaledBounds(original, small, 2), small)
})
test('presentation pause keeps remaining time and waits for every reason to clear', () => {
  const clock = new FakeClock()
  const engine = new BehaviorEngine({ clock, random: () => 0 })
  const update = createPresentationPause(engine)
  engine.start()
  clock.advance(5000)
  const remaining = engine.getSnapshot().remainingMs
  update(true)
  update(true)
  clock.advance(3600000)
  assert.equal(engine.getSnapshot().remainingMs, remaining)
  assert.equal(clock.pending.size, 0)
  update(false)
  assert.equal(engine.getSnapshot().status, 'running')
  assert.equal(engine.getSnapshot().remainingMs, remaining)
  assert.equal(clock.pending.size, 1)
  engine.dispose()
})
test('presentation cannot restart an explicit pause or a stopped behavior', () => {
  const engine = new BehaviorEngine({ clock: new FakeClock(), random: () => 0 })
  const update = createPresentationPause(engine)
  engine.start()
  engine.pause()
  update(true)
  update(false)
  assert.equal(engine.getSnapshot().status, 'paused')
  engine.resume()
  update(true)
  engine.stop()
  update(false)
  assert.equal(engine.getSnapshot().status, 'stopped')
  engine.dispose()
})
test('turning off spontaneous dialogue hides passive text but preserves requested interaction', () => {
  const view = { textContent: '', hidden: true }
  const presenter = new GreetingPresenter(view, new FakeClock())
  presenter.show('passive')
  presenter.hidePassive()
  assert.equal(view.hidden, true)
  presenter.show('click', 3000, 'interaction')
  presenter.hidePassive()
  assert.equal(view.textContent, 'click')
  assert.equal(view.hidden, false)
  presenter.dispose()
})
