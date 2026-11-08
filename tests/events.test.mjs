import assert from 'node:assert/strict'
import test from 'node:test'
import { URL } from 'node:url'
import { readFileSync } from 'node:fs'
import {
  validateCatalog,
  validateEvent,
  validateEventRecords,
  isEventUnlocked,
  pagesFor,
  canResume,
} from '../src/events/event-schema.ts'
import { EventPlayer, isEventCommand } from '../src/events/event-player.ts'
import { defaultMemory, validateMemory } from '../src/shared/memory-state.ts'
import { MemorySession } from '../src/main/memory-session.ts'
const raw = JSON.parse(
  readFileSync(
    new URL('../src/events/data/sample.json', import.meta.url),
    'utf8',
  ),
)
const sample = validateEvent(raw)
const fixture = (catalog = [sample]) => {
  const session = new MemorySession(
    defaultMemory(),
    () => 0,
    '2026-11-08T00:00:00Z',
  )
  const player = new EventPlayer(
    catalog,
    () => session.snapshot(),
    (id, p) => session.eventCheckpoint(id, p),
  )
  const command = (kind, fields = {}) =>
    player.apply({ kind, revision: player.view().revision, ...fields })
  return { session, player, command }
}
test('sample follows dialogue, choice, CG, explicit end, saving visited/choices/completion without affection rewards', () => {
  const { session, player, command } = fixture()
  player.open('general')
  command('start', { eventId: sample.id, resume: false })
  assert.equal(player.view().frame.nodeId, 'hello')
  command('advance')
  assert.equal(player.view().frame.nodeId, 'choose')
  assert.throws(() => command('advance'), /Choice required/)
  command('choose', { choiceId: 'tea' })
  assert.equal(player.view().frame.cgAssetId, 'tea-card')
  command('advance')
  assert.equal(player.view().frame.end, true)
  assert.equal(session.snapshot().events[sample.id].completed, false)
  command('advance')
  assert.equal(player.view().phase, 'completed')
  const memory = session.snapshot()
  assert.deepEqual(memory.events[sample.id].visited, [
    'hello',
    'choose',
    'tea',
    'end',
  ])
  assert.deepEqual(memory.events[sample.id].choices, { choose: 'tea' })
  assert.equal(memory.events[sample.id].completed, true)
  assert.equal(memory.affection, 0)
  assert.equal(memory.interactionCount, 0)
})
test('validator rejects malformed exits, duplicate IDs, missing nodes, cycles and unreachable data', () => {
  const mutations = [
    (e) => (e.nodes[0].next = 'missing'),
    (e) => (e.nodes[0].next = 'hello'),
    (e) => e.nodes.push({ ...e.nodes[0] }),
    (e) => e.nodes[1].choices.push({ ...e.nodes[1].choices[0] }),
    (e) => (e.nodes[4].end = false),
    (e) => (e.nodes[0].expression = 'invalid'),
    (e) => (e.nodes[0].effect = 'javascript'),
    (e) => (e.nodes[0].cgAssetId = 'https://outside'),
    (e) => e.nodes.push({ ...e.nodes[4], id: 'unused' }),
    (e) => (e.condition.minAffection = -1),
    (e) => (e.nodes[0].text = 'x'.repeat(8001)),
    (e) => (e.nodes[0].next = null),
  ]
  for (const mutate of mutations) {
    const e = JSON.parse(JSON.stringify(raw))
    mutate(e)
    assert.throws(() => validateEvent(e))
  }
  assert.throws(() => validateEvent(null))
  assert.throws(() =>
    validateEvent({ ...raw, nodes: Array(129).fill(raw.nodes[0]) }),
  )
})
test('long dialogue keeps every code point and cannot expose or select choices before the final page', () => {
  const e = JSON.parse(JSON.stringify(raw))
  e.nodes[1].text = '🌸'.repeat(401)
  const { player, command } = fixture([validateEvent(e)])
  player.open('general')
  command('start', { eventId: e.id, resume: false })
  command('advance')
  const pages = []
  for (let i = 0; i < 3; i++) {
    const view = player.view()
    pages.push(view.frame.text)
    assert.equal(view.frame.page, i)
    if (i < 2) {
      assert.deepEqual(view.frame.choices, [])
      assert.throws(() => command('choose', { choiceId: 'tea' }), /Unread/)
      command('advance')
    }
  }
  assert.equal(pages.join(''), e.nodes[1].text)
  assert.equal(player.view().frame.choices.length, 2)
  assert.equal(pagesFor(e.nodes[1].text).length, 3)
})
test('unlock and audience are checked again on direct start without changing the visible state', () => {
  const locked = validateEvent({
    ...raw,
    id: 'locked',
    condition: { minAffection: 70, requiredCompleted: [sample.id] },
  })
  const privateEvent = validateEvent({
    ...raw,
    id: 'private-test',
    audience: 'private',
  })
  const { session, player, command } = fixture([sample, locked, privateEvent])
  player.open('general')
  const before = player.view()
  for (const id of ['locked', 'private-test', 'missing'])
    assert.throws(
      () => command('start', { eventId: id, resume: false }),
      /unavailable/,
    )
  assert.deepEqual(player.view(), before)
  assert.equal(
    player.view().events.some((e) => e.id === 'private-test'),
    false,
  )
  assert.equal(isEventUnlocked(locked, 100, {}), false)
  assert.equal(
    isEventUnlocked(locked, 70, { [sample.id]: { completed: true } }),
    true,
  )
  assert.equal(
    isEventUnlocked(locked, NaN, { [sample.id]: { completed: true } }),
    false,
  )
  assert.deepEqual(session.snapshot().events, {})
  player.open('private')
  command('start', { eventId: 'private-test', resume: false })
  assert.equal(player.view().frame.eventId, 'private-test')
})
test('repeated commands, pause, close and reopen cannot silently advance or restore a session', () => {
  const { player, command } = fixture()
  player.open('general')
  command('start', { eventId: sample.id, resume: false })
  const revision = player.view().revision
  command('advance')
  assert.throws(() => player.apply({ kind: 'advance', revision }), /Stale/)
  player.pause()
  const paused = player.view()
  assert.throws(() => command('choose', { choiceId: 'tea' }), /paused/)
  assert.deepEqual(player.view(), paused)
  command('resume')
  assert.equal(player.view().paused, false)
  player.close()
  assert.throws(() => command('advance'), /Stale/)
  player.open('general')
  assert.equal(player.view().frame, null)
  assert.equal(player.view().events[0].resumable, true)
})
test('checkpoints survive a new player but require explicit resume; broken paths and changed scripts are rejected', () => {
  const { session, player, command } = fixture()
  player.open('general')
  command('start', { eventId: sample.id, resume: false })
  command('advance')
  command('choose', { choiceId: 'book' })
  const saved = validateMemory(JSON.parse(JSON.stringify(session.snapshot())))
  const next = new EventPlayer(
    [sample],
    () => saved,
    () => {},
  )
  next.open('general')
  assert.equal(next.view().phase, 'list')
  assert.equal(next.view().frame, null)
  next.apply({
    kind: 'start',
    revision: next.view().revision,
    eventId: sample.id,
    resume: true,
  })
  assert.equal(next.view().frame.nodeId, 'book')
  assert.equal(next.view().frame.cgAssetId, 'missing-card')
  const progress = saved.events[sample.id]
  assert.equal(
    canResume(sample, { ...progress, visited: ['hello', 'book'] }),
    false,
  )
  assert.equal(canResume(sample, { ...progress, page: 99 }), false)
  assert.equal(canResume({ ...sample, version: 2 }, progress), false)
  assert.equal(
    canResume(sample, { ...progress, choices: { choose: 'tea' } }),
    false,
  )
})
test('old saves default to no events, known fields reconstruct, malformed or oversized checkpoints reject safely', () => {
  const old = defaultMemory()
  delete old.events
  old.affection = 70
  old.relationshipStage = 'close'
  const migrated = validateMemory(old)
  assert.deepEqual(migrated.events, {})
  assert.equal(migrated.affection, 70)
  const { session, player, command } = fixture()
  player.open('general')
  command('start', { eventId: sample.id, resume: false })
  const records = session.snapshot().events
  assert.deepEqual(validateEventRecords(records), records)
  for (const value of [
    null,
    [],
    { 'bad/id': records[sample.id] },
    { [sample.id]: { ...records[sample.id], page: -1 } },
    { [sample.id]: { ...records[sample.id], completed: 'yes' } },
    Object.fromEntries(
      Array.from({ length: 33 }, (_, i) => ['event-' + i, records[sample.id]]),
    ),
  ])
    assert.throws(() => validateEventRecords(value))
})
test('synchronous checkpoint failure is transactional and does not advance the player', () => {
  const player = new EventPlayer(
    [sample],
    () => ({ affection: 0, events: {} }),
    () => {
      throw Error('save rejected')
    },
  )
  player.open('general')
  const before = player.view()
  assert.throws(
    () =>
      player.apply({
        kind: 'start',
        revision: before.revision,
        eventId: sample.id,
        resume: false,
      }),
    /save rejected/,
  )
  assert.deepEqual(player.view(), before)
})
test('IPC accepts only bounded, exact event intents, never paths, node jumps or arbitrary save data', () => {
  for (const v of [
    null,
    [],
    {},
    { kind: 'start', revision: 0, eventId: sample.id, resume: 'true' },
    { kind: 'advance', revision: 0, node: 'end' },
    { kind: 'choose', revision: -1, choiceId: 'tea' },
    { kind: 'save', revision: 0 },
    { kind: 'start', revision: 0, eventId: '../private', resume: false },
  ])
    assert.equal(isEventCommand(v), false)
  assert.equal(
    isEventCommand({
      kind: 'start',
      revision: 0,
      eventId: sample.id,
      resume: true,
    }),
    true,
  )
  assert.equal(
    isEventCommand({ kind: 'choose', revision: 3, choiceId: 'tea' }),
    true,
  )
})

test('catalog rejects duplicate events and missing or cyclic unlock dependencies', () => {
  assert.equal(validateCatalog([raw]).length, 1)
  assert.throws(() => validateCatalog([raw, raw]), /Duplicate/)
  const next = {
    ...raw,
    id: 'next',
    condition: { minAffection: 0, requiredCompleted: ['missing'] },
  }
  assert.throws(() => validateCatalog([raw, next]), /Unknown/)
  next.condition.requiredCompleted = [raw.id]
  assert.throws(
    () =>
      validateCatalog([
        { ...raw, condition: { minAffection: 0, requiredCompleted: ['next'] } },
        next,
      ]),
    /cycle/,
  )
})
