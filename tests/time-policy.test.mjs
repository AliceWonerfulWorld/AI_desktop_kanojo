import assert from 'node:assert/strict'
import test from 'node:test'
import { timeContextAt } from '../src/behavior/time-policy.ts'
import { BehaviorEngine } from '../src/behavior/behavior-engine.ts'
import { createPowerLifecycle } from '../src/behavior/power-lifecycle.ts'
import {
  GreetingPresenter,
  greetingFor,
} from '../src/renderer/src/dialogue/greeting.ts'
import { FakeClock } from './helpers/fake-clock.mjs'

const at = (hour, minute = 0, second = 0) =>
  new Date(2026, 10, 7, hour, minute, second)
const samples = (...values) => {
  let i = 0
  return () => {
    assert.ok(i < values.length)
    return values[i++]
  }
}

test('all four local-time boundaries including midnight are exact', () => {
  for (const [hour, minute, second, expected] of [
    [0, 0, 0, 'late-night'],
    [5, 59, 59, 'late-night'],
    [6, 0, 0, 'morning'],
    [10, 59, 59, 'morning'],
    [11, 0, 0, 'daytime'],
    [17, 59, 59, 'daytime'],
    [18, 0, 0, 'evening'],
    [22, 59, 59, 'evening'],
    [23, 0, 0, 'late-night'],
    [23, 59, 59, 'late-night'],
  ])
    assert.equal(timeContextAt(at(hour, minute, second)).period, expected)
  assert.throws(() => timeContextAt(new Date(NaN)), RangeError)
})

test('weights match the spec and are immutable', () => {
  for (const [hour, weights] of [
    [6, { idle: 35, reading: 25, resting: 30, sleeping: 10 }],
    [11, { idle: 25, reading: 40, resting: 30, sleeping: 5 }],
    [18, { idle: 30, reading: 25, resting: 30, sleeping: 15 }],
    [23, { idle: 10, reading: 5, resting: 15, sleeping: 70 }],
  ])
    assert.deepEqual(timeContextAt(at(hour)).weights, weights)
  assert.throws(() => {
    timeContextAt(at(23)).weights.sleeping = 0
  }, TypeError)
})

test('seeded quantiles select sleep more often at night, including the first action', () => {
  const counts = []
  for (const hour of [12, 0]) {
    let sleeping = 0
    for (let i = 0; i < 1000; i++) {
      const clock = new FakeClock()
      const engine = new BehaviorEngine({
        clock,
        random: samples((i + 0.5) / 1000, 0),
        selectionPolicy: () => timeContextAt(at(hour)),
      })
      engine.start()
      if (engine.getSnapshot().current.action === 'sleeping') sleeping++
      engine.dispose()
    }
    counts.push(sleeping)
  }
  assert.deepEqual(counts, [50, 700])
})

test('crossing a period changes the next choice without interrupting an active action', () => {
  const clock = new FakeClock()
  let date = at(10, 59, 59)
  const engine = new BehaviorEngine({
    clock,
    random: samples(0.1, 0, 0.4, 0),
    selectionPolicy: () => timeContextAt(date),
  })
  engine.start()
  const before = engine.getSnapshot().current
  date = at(11)
  clock.advance(10000)
  assert.equal(engine.getSnapshot().current, before)
  clock.advance(10000)
  assert.equal(engine.getSnapshot().current.action, 'reading')
  engine.dispose()
})

test('sleep can repeat at night, but not after the morning boundary', () => {
  const clock = new FakeClock()
  let date = at(23)
  const engine = new BehaviorEngine({
    clock,
    random: samples(0.99, 0, 0.99, 0, 0.99, 0),
    selectionPolicy: () => timeContextAt(date),
  })
  engine.start()
  clock.advance(120000)
  assert.equal(engine.getSnapshot().current.action, 'sleeping')
  assert.equal(engine.getSnapshot().current.sequence, 2)
  date = at(6)
  clock.advance(120000)
  assert.equal(engine.getSnapshot().current.action, 'resting')
  assert.equal(clock.maximum, 1)
  engine.dispose()
})

test('large forward/backward wall-clock jumps do not add elapsed/interaction time or duplicate timers', () => {
  const clock = new FakeClock()
  let date = at(8)
  const engine = new BehaviorEngine({
    clock,
    random: () => 0,
    selectionPolicy: () => timeContextAt(date),
  })
  engine.start()
  date = new Date(2099, 0, 1, 23)
  assert.equal(engine.getSnapshot().remainingMs, 20000)
  date = new Date(2000, 0, 1, 12)
  clock.advance(1000)
  assert.equal(engine.getSnapshot().remainingMs, 19000)
  clock.advance(19000)
  assert.equal(engine.getSnapshot().current.action, 'reading')
  assert.equal(clock.maximum, 1)
  assert.equal('interactionCount' in engine.getSnapshot(), false)
  assert.equal('totalActiveMinutes' in engine.getSnapshot(), false)
  engine.dispose()
})

test('OS suspend/resume is idempotent and uses fresh local time for the next selection', () => {
  const clock = new FakeClock()
  let date = at(8)
  const engine = new BehaviorEngine({
    clock,
    random: samples(0.1, 0, 0.99, 0),
    selectionPolicy: () => timeContextAt(date),
  })
  const power = createPowerLifecycle(engine)
  engine.start()
  clock.advance(1000)
  assert.equal(power('suspend'), true)
  assert.equal(power('suspend'), false)
  clock.advance(8 * 60 * 60 * 1000)
  date = at(23)
  assert.equal(engine.getSnapshot().remainingMs, 19000)
  assert.equal(power('resume'), true)
  assert.equal(power('resume'), false)
  assert.equal(clock.pending.size, 1)
  clock.advance(19000)
  assert.equal(engine.getSnapshot().current.action, 'sleeping')
  assert.equal(clock.maximum, 1)
  engine.dispose()
})

test('OS resume preserves explicit pauses and stops', () => {
  const clock = new FakeClock()
  const engine = new BehaviorEngine({ clock, random: () => 0 })
  const power = createPowerLifecycle(engine)
  engine.start()
  engine.pause()
  power('suspend')
  power('resume')
  assert.equal(engine.getSnapshot().status, 'paused')
  engine.resume()
  power('suspend')
  engine.stop()
  power('resume')
  assert.equal(engine.getSnapshot().status, 'stopped')
  assert.equal(clock.pending.size, 0)
  engine.dispose()
})

test('greetings vary by period and only the first launch includes an introduction', () => {
  const texts = new Set()
  for (const hour of [8, 12, 20, 1]) {
    const period = timeContextAt(at(hour)).period
    const first = greetingFor(period, true)
    const returning = greetingFor(period, false)
    assert.ok(first.startsWith('はじめまして！'))
    assert.equal(returning.includes('はじめまして'), false)
    assert.ok(first.endsWith(returning))
    texts.add(returning)
  }
  assert.equal(texts.size, 4)
})

test('greeting expires after five monotonic seconds; stale callbacks and disposal cannot revive it', () => {
  const clock = new FakeClock()
  const view = { hidden: true, textContent: '' }
  const greeting = new GreetingPresenter(view, clock)
  greeting.show('first')
  const stale = [...clock.pending.values()][0].callback
  clock.advance(4000)
  greeting.show('replacement')
  stale()
  assert.equal(view.textContent, 'replacement')
  clock.advance(4999)
  assert.equal(view.hidden, false)
  clock.advance(1)
  assert.equal(view.hidden, true)
  assert.equal(clock.pending.size, 0)
  greeting.dispose()
  greeting.show('after disposal')
  assert.equal(view.hidden, true)
  assert.equal(clock.pending.size, 0)
})
