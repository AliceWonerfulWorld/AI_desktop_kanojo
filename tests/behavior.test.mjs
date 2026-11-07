import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BehaviorEngine,
  defaultBehaviorRules,
} from '../src/behavior/behavior-engine.ts'
import { createBehaviorRuntime } from '../src/renderer/src/behavior/runtime.ts'

class FakeClock {
  time = 0
  pending = new Map()
  maximum = 0
  now = () => this.time
  schedule = (callback, delayMs) => {
    const token = {}
    this.pending.set(token, { callback, deadline: this.time + delayMs })
    this.maximum = Math.max(this.maximum, this.pending.size)
    return () => this.pending.delete(token)
  }
  advance(ms) {
    const target = this.time + ms
    while (this.pending.size) {
      const [token, next] = [...this.pending].sort(
        (a, b) => a[1].deadline - b[1].deadline,
      )[0]
      if (next.deadline > target) break
      this.time = next.deadline
      this.pending.delete(token)
      next.callback()
    }
    this.time = target
  }
  fireLate(ms) {
    this.time += ms
    const scheduled = [...this.pending]
    this.pending.clear()
    for (const [, task] of scheduled) task.callback()
  }
}
const sequenceRandom = (...samples) => {
  let index = 0
  return () => {
    assert.ok(index < samples.length, 'unexpected random consumption')
    return samples[index++]
  }
}

test('fake clock and fixed samples reproduce action durations and notifications without UI', () => {
  const clock = new FakeClock()
  const engine = new BehaviorEngine({
    clock,
    random: sequenceRandom(0, 0, 0, 0.6, 0.5, 0.99, 0.5),
  })
  const events = []
  engine.subscribe((event) => events.push(event))
  engine.start()
  assert.equal(engine.getSnapshot().current.action, 'idle')
  clock.advance(19999)
  assert.equal(events.length, 1)
  clock.advance(1)
  assert.equal(engine.getSnapshot().current.action, 'reading')
  clock.advance(60000)
  assert.equal(engine.getSnapshot().current.action, 'resting')
  assert.equal(engine.getSnapshot().current.durationMs, 75000)
  clock.advance(75000)
  assert.equal(engine.getSnapshot().current.action, 'sleeping')
  assert.equal(engine.getSnapshot().current.durationMs, 210000)
  assert.deepEqual(
    events.map((event) => event.reason),
    ['started', 'transition', 'transition', 'transition'],
  )
  assert.deepEqual(
    events.map((event) => event.previous),
    [null, 'idle', 'reading', 'resting'],
  )
  assert.equal(clock.pending.size, 1)
  assert.equal(clock.maximum, 1)
  engine.dispose()
})

test('weighted boundaries are normalized after excluding the previous action', () => {
  // After idle, weights are reading:25, resting:30, sleeping:10 (total 65).
  for (const [value, expected] of [
    [0, 'reading'],
    [24.999 / 65, 'reading'],
    [25 / 65, 'resting'],
    [54.999 / 65, 'resting'],
    [55 / 65, 'sleeping'],
    [0.999999, 'sleeping'],
  ]) {
    const clock = new FakeClock()
    const engine = new BehaviorEngine({
      clock,
      random: sequenceRandom(0, value, 0),
    })
    engine.start()
    clock.advance(20000)
    assert.equal(engine.getSnapshot().current.action, expected)
    engine.dispose()
  }
})

test('durations stay within the spec and consecutive actions never repeat over a long replay', () => {
  for (const value of [0, 0.5, 0.999999]) {
    const clock = new FakeClock()
    const engine = new BehaviorEngine({ clock, random: () => value })
    let previous = null
    let count = 0
    engine.subscribe(({ reason, snapshot }) => {
      if (reason !== 'started' && reason !== 'transition') return
      const state = snapshot.current
      assert.notEqual(state.action, previous)
      const [min, max] = defaultBehaviorRules[state.action].durationMs
      assert.ok(state.durationMs >= min && state.durationMs <= max)
      previous = state.action
      count++
    })
    engine.start()
    clock.advance(24 * 60 * 60 * 1000)
    assert.ok(count > 100)
    assert.equal(clock.maximum, 1)
    engine.dispose()
  }
})

test('start/pause/resume are idempotent and retain the remaining active duration', () => {
  const clock = new FakeClock()
  const engine = new BehaviorEngine({ clock, random: () => 0 })
  engine.start()
  engine.start()
  clock.advance(5000)
  const initial = engine.getSnapshot().current
  engine.pause()
  engine.pause()
  engine.start()
  assert.equal(engine.getSnapshot().status, 'paused')
  assert.equal(engine.getSnapshot().remainingMs, 15000)
  assert.equal(clock.pending.size, 0)
  clock.advance(100000)
  assert.equal(engine.getSnapshot().remainingMs, 15000)
  engine.resume()
  engine.resume()
  assert.equal(engine.getSnapshot().current.sequence, initial.sequence)
  assert.equal(clock.pending.size, 1)
  clock.advance(14999)
  assert.equal(engine.getSnapshot().current.action, 'idle')
  clock.advance(1)
  assert.equal(engine.getSnapshot().current.action, 'reading')
  assert.equal(clock.maximum, 1)
  engine.dispose()
})

test('stop/restart and dispose invalidate queued callbacks, even if cancellation races', () => {
  const clock = new FakeClock()
  const engine = new BehaviorEngine({ clock, random: () => 0 })
  engine.start()
  const stale = [...clock.pending.values()][0].callback
  engine.stop()
  engine.stop()
  engine.resume()
  assert.equal(engine.getSnapshot().status, 'stopped')
  assert.equal(clock.pending.size, 0)
  engine.start()
  const before = engine.getSnapshot()
  clock.time = 1000000
  stale()
  assert.deepEqual(engine.getSnapshot().current, before.current)
  assert.equal(clock.pending.size, 1)
  engine.dispose()
  engine.dispose()
  stale()
  assert.equal(clock.pending.size, 0)
  assert.equal(engine.getSnapshot().status, 'disposed')
  assert.throws(() => engine.start(), /disposed/)
})

test('early callbacks rearm; late callbacks advance only once without a replay burst', () => {
  const clock = new FakeClock()
  const engine = new BehaviorEngine({ clock, random: () => 0 })
  engine.start()
  clock.fireLate(1000)
  assert.equal(engine.getSnapshot().current.sequence, 1)
  assert.equal(engine.getSnapshot().remainingMs, 19000)
  clock.fireLate(10000000)
  assert.equal(engine.getSnapshot().current.sequence, 2)
  assert.equal(engine.getSnapshot().current.startedAtMs, clock.time)
  assert.equal(engine.getSnapshot().remainingMs, 60000)
  assert.equal(clock.pending.size, 1)
  engine.dispose()
})

test('listener errors, unsubscription and lifecycle changes do not duplicate or revive timers', () => {
  const clock = new FakeClock()
  const errors = []
  const engine = new BehaviorEngine({
    clock,
    random: () => 0,
    onError: (error) => errors.push(error),
  })
  const unsubscribe = engine.subscribe(() => {
    throw new Error('consumer failed')
  })
  engine.start()
  assert.equal(errors.length, 1)
  unsubscribe()
  engine.subscribe((event) => {
    if (event.reason === 'transition') engine.pause()
  })
  clock.advance(20000)
  assert.equal(engine.getSnapshot().status, 'paused')
  assert.equal(clock.pending.size, 0)
  engine.dispose()
  assert.equal(clock.pending.size, 0)
})

test('invalid rules and random values fail safely instead of entering invalid states', () => {
  const clock = new FakeClock()
  for (const change of [
    { durationMs: [0, 100], weight: 1 },
    { durationMs: [100, 50], weight: 1 },
    { durationMs: [1, Infinity], weight: 1 },
    { durationMs: [1, 2], weight: -1 },
  ]) {
    assert.throws(
      () =>
        new BehaviorEngine({
          clock,
          rules: { ...defaultBehaviorRules, idle: change },
        }),
      RangeError,
    )
  }
  assert.throws(
    () =>
      new BehaviorEngine({
        clock,
        rules: Object.fromEntries(
          Object.entries(defaultBehaviorRules).map(([action, rule]) => [
            action,
            { ...rule, weight: action === 'idle' ? 1 : 0 },
          ]),
        ),
      }),
    RangeError,
  )
  for (const random of [() => NaN, () => 1, () => -0.1]) {
    const engine = new BehaviorEngine({ clock, random })
    assert.throws(() => engine.start(), RangeError)
    assert.equal(engine.getSnapshot().status, 'stopped')
    assert.equal(clock.pending.size, 0)
  }
  const errors = []
  const engine = new BehaviorEngine({
    clock,
    random: sequenceRandom(0, NaN),
    onError: (error) => errors.push(error),
  })
  engine.start()
  clock.advance(20000)
  assert.equal(engine.getSnapshot().status, 'stopped')
  assert.equal(clock.pending.size, 0)
  assert.equal(errors.length, 1)
})

test('snapshots and rules are isolated from consumer mutation', () => {
  const clock = new FakeClock()
  const rules = JSON.parse(JSON.stringify(defaultBehaviorRules))
  const engine = new BehaviorEngine({ clock, random: () => 0, rules })
  rules.idle.durationMs[0] = 1
  engine.start()
  assert.equal(engine.getSnapshot().current.durationMs, 20000)
  assert.throws(() => {
    engine.getSnapshot().current.action = 'invalid'
  }, TypeError)
  engine.dispose()
})

test('presentation consumes semantic notifications through the renderer interface', async () => {
  const clock = new FakeClock()
  const visuals = []
  const notifications = []
  const renderer = {
    setState: async (state) => {
      visuals.push(state)
    },
    hitTest: () => false,
    dispose: () => {},
  }
  const engine = createBehaviorRuntime(
    renderer,
    (event) => notifications.push(event),
    { clock, random: sequenceRandom(0, 0, 0, 0.6, 0, 0.99, 0) },
  )
  engine.start()
  clock.advance(20000 + 60000 + 30000)
  await Promise.resolve()
  assert.deepEqual(visuals, [
    { action: 'idle', expression: 'neutral' },
    { action: 'reading', expression: 'neutral' },
    { action: 'resting', expression: 'smile' },
    { action: 'sleeping', expression: 'sleepy' },
  ])
  assert.equal(notifications.length, 4)
  assert.ok(notifications.every((event) => !('dialogue' in event)))
  engine.dispose()
})
