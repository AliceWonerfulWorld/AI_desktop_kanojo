import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RelationshipModel,
  relationshipStage,
} from '../src/relationship/relationship.ts'
import { chooseResponse } from '../src/interaction/responses.ts'
import {
  GreetingPresenter,
  greetingFor,
} from '../src/renderer/src/dialogue/greeting.ts'
import { InteractionRenderer } from '../src/renderer/src/interaction/interaction-renderer.ts'
import { assetCandidates } from '../src/renderer/src/character/asset-selection.ts'
import { FakeClock } from './helpers/fake-clock.mjs'

test('stage boundaries and invalid initial values are exact; snapshots are immutable', () => {
  for (const [value, stage] of [
    [0, 'stranger'],
    [29, 'stranger'],
    [30, 'familiar'],
    [69, 'familiar'],
    [70, 'close'],
    [100, 'close'],
  ]) {
    const model = new RelationshipModel(() => 0, value)
    assert.deepEqual(model.getSnapshot(), { affection: value, stage })
    assert.ok(Object.isFrozen(model.getSnapshot()))
  }
  for (const invalid of [-1, 101, 1.5, NaN, Infinity, '30', null]) {
    assert.throws(() => relationshipStage(invalid), RangeError)
    assert.throws(() => new RelationshipModel(() => 0, invalid), RangeError)
  }
})

test('spam and accepted clicks every three seconds earn only one point per minute', () => {
  const clock = new FakeClock()
  const model = new RelationshipModel(clock.now)
  for (let i = 0; i < 10000; i++) model.recordInteraction()
  assert.equal(model.getSnapshot().affection, 1)
  for (let i = 0; i < 19; i++) {
    clock.advance(3000)
    model.recordInteraction()
  }
  clock.advance(2999)
  assert.equal(model.recordInteraction().affection, 1)
  clock.advance(1)
  assert.equal(model.recordInteraction().affection, 2)
})

test('long absence adds no automatic gains or decay; next interaction awards at most one point', () => {
  const clock = new FakeClock()
  const model = new RelationshipModel(clock.now, 69)
  clock.advance(365 * 86400000)
  assert.deepEqual(model.getSnapshot(), { affection: 69, stage: 'familiar' })
  assert.deepEqual(model.recordInteraction(), { affection: 70, stage: 'close' })
  clock.advance(365 * 86400000)
  assert.equal(model.getSnapshot().affection, 70)
  assert.equal(model.recordInteraction().affection, 71)
  const capped = new RelationshipModel(clock.now, 100)
  assert.equal(capped.recordInteraction().affection, 100)
  clock.time -= 86400000
  assert.equal(model.recordInteraction().affection, 71)
})

test('all stages have distinct short dialogue for every action and time period, preserving sleepy reactions', () => {
  for (const action of ['idle', 'reading', 'resting', 'sleeping']) {
    const ids = new Set()
    const texts = new Set()
    for (const stage of ['stranger', 'familiar', 'close']) {
      const choices = [0, 0.4, 0.99].map((n) =>
        chooseResponse(action, () => n, undefined, stage),
      )
      for (const response of choices) {
        ids.add(response.id)
        texts.add(response.text)
        assert.ok(response.text.length < 40)
        if (action === 'sleeping') assert.equal(response.expression, 'sleepy')
        if (stage === 'stranger')
          assert.ok(!['shy', 'affectionate'].includes(response.expression))
        if (stage === 'familiar')
          assert.notEqual(response.expression, 'affectionate')
      }
      assert.notEqual(
        chooseResponse(action, () => 0, choices[0].id, stage).id,
        choices[0].id,
      )
      if (action !== 'sleeping' && stage !== 'stranger')
        assert.ok(
          choices.some(
            (entry) =>
              entry.expression ===
              (stage === 'familiar' ? 'shy' : 'affectionate'),
          ),
        )
    }
    assert.equal(ids.size, 9)
    assert.equal(texts.size, 9)
  }
  for (const period of ['morning', 'daytime', 'evening', 'late-night']) {
    const greetings = ['stranger', 'familiar', 'close'].map((stage) =>
      greetingFor(period, false, stage),
    )
    assert.equal(new Set(greetings).size, 3)
    assert.ok(greetings.every((text) => !text.includes('はじめまして')))
  }
})

test('accepted reactions alone award points; stage change applies to next reaction and behavior stays unchanged', async () => {
  const clock = new FakeClock()
  const model = new RelationshipModel(clock.now, 29)
  const view = { hidden: true, textContent: '' }
  const bubble = new GreetingPresenter(view, clock)
  const frames = []
  const renderer = new InteractionRenderer(
    {
      setState: async (state) => {
        frames.push(state)
        return {
          state,
          applied: true,
          assetId: 'test',
          fallback: false,
          unavailable: [],
        }
      },
      hitTest: () => true,
      dispose: () => {},
    },
    bubble,
    clock,
    () => 0.4,
    () => model.recordInteraction(),
    () => model.getSnapshot().stage,
  )
  assert.equal(renderer.react(), null)
  assert.equal(model.getSnapshot().affection, 29)
  await renderer.setState({ action: 'reading', expression: 'neutral' })
  assert.equal(renderer.react().stage, 'stranger')
  assert.deepEqual(model.getSnapshot(), { affection: 30, stage: 'familiar' })
  for (let i = 0; i < 100; i++) assert.equal(renderer.react(), null)
  clock.advance(3000)
  const familiar = renderer.react()
  assert.equal(familiar.stage, 'familiar')
  assert.equal(familiar.expression, 'shy')
  assert.equal(model.getSnapshot().affection, 30)
  clock.advance(3000)
  assert.deepEqual(frames.at(-1), { action: 'reading', expression: 'neutral' })
  renderer.dispose()
  assert.equal(renderer.react(), null)
  assert.equal(model.getSnapshot().affection, 30)
})

test('missing intimacy assets use smile, but exact assets retain precedence', () => {
  const smile = {
    id: 'smile',
    action: 'idle',
    expression: 'smile',
    url: 'smile',
  }
  const neutral = {
    id: 'neutral',
    action: 'idle',
    expression: 'neutral',
    url: 'neutral',
  }
  for (const expression of ['shy', 'affectionate']) {
    const state = { action: 'reading', expression }
    const exact = { id: expression, ...state, url: expression }
    assert.equal(assetCandidates(state, [smile, neutral])[0].id, 'smile')
    assert.equal(
      assetCandidates(state, [smile, exact, neutral])[0].id,
      expression,
    )
    assert.equal(assetCandidates(state, [neutral])[0].id, 'neutral')
  }
})
