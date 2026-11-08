import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultMemory, validateMemory } from '../src/shared/memory-state.ts'
import { MemoryStore } from '../src/main/memory-store.ts'
import { MemorySession } from '../src/main/memory-session.ts'
import { BehaviorEngine } from '../src/behavior/behavior-engine.ts'
import { FakeClock } from './helpers/fake-clock.mjs'

const stamp = '2026-11-08T00:00:00.000Z'
async function directory(run) {
  const path = await mkdtemp(join(tmpdir(), 'kanojo-memory-'))
  try {
    await run(path)
  } finally {
    await rm(path, { recursive: true, force: true })
  }
}
function saved(affection) {
  const state = defaultMemory()
  state.affection = affection
  state.relationshipStage =
    affection >= 70 ? 'close' : affection >= 30 ? 'familiar' : 'stranger'
  return state
}

test('versioned save validates bounds, stages, counters, time and settings and strips unknown fields', () => {
  assert.deepEqual(
    validateMemory({ ...defaultMemory(), surprise: '/private/path' }),
    defaultMemory(),
  )
  for (const change of [
    { schemaVersion: 2 },
    { affection: -1 },
    { affection: 100, relationshipStage: 'stranger' },
    { interactionCount: 0.1 },
    { interactionCount: -1 },
    { totalActiveMs: NaN },
    { totalActiveMs: -1 },
    { lastAction: 'invalid' },
    { lastLaunchedAt: 'invalid' },
    { affectionCooldownMs: 60001 },
    { interactionCooldownMs: 15001 },
    { settings: {} },
    {
      settings: {
        ...defaultMemory().settings,
        windowBounds: { x: 0, y: 0, width: -1, height: 500 },
      },
    },
  ])
    assert.throws(() => validateMemory({ ...defaultMemory(), ...change }))
})

test('atomic serialized saves survive a new store and retain previous valid backup', async () => {
  await directory(async (path) => {
    const store = new MemoryStore(path)
    await store.load()
    const first = saved(30),
      second = saved(70)
    second.lastLaunchedAt = stamp
    second.settings.alwaysOnTop = false
    second.settings.clickThrough = false
    second.settings.windowBounds = { x: -500, y: 25, width: 340, height: 580 }
    second.lastAction = 'reading'
    second.totalActiveMs = 12345
    second.interactionCount = 42
    second.affectionCooldownMs = 50000
    await Promise.all([store.save(first), store.save(second)])
    assert.deepEqual(await new MemoryStore(path).load(), second)
    assert.deepEqual(
      JSON.parse(await readFile(join(path, 'memory.json.bak'), 'utf8')),
      first,
    )
    assert.ok(!(await readdir(path)).some((name) => name.endsWith('.tmp')))
  })
})

test('corrupt primary is quarantined and backup is restored; corrupt/future files never silently disappear', async () => {
  await directory(async (path) => {
    const store = new MemoryStore(path, () => {})
    await store.load()
    await store.save(saved(30))
    await store.save(saved(70))
    await writeFile(join(path, 'memory.json'), '{broken')
    assert.equal((await new MemoryStore(path, () => {}).load()).affection, 30)
    assert.ok(
      (await readdir(path)).some((name) =>
        name.startsWith('memory.json.invalid-'),
      ),
    )
    await writeFile(
      join(path, 'memory.json'),
      JSON.stringify({ schemaVersion: 99 }),
    )
    await writeFile(join(path, 'memory.json.bak'), '{}')
    await writeFile(join(path, 'memory.json.tmp'), JSON.stringify(saved(100)))
    assert.deepEqual(
      await new MemoryStore(path, () => {}).load(),
      defaultMemory(),
    )
    assert.equal(
      (await readdir(path)).filter((name) => name.includes('.invalid-')).length,
      3,
    )
  })
})

test('failed temporary write preserves committed primary and next save can recover', async () => {
  await directory(async (path) => {
    const store = new MemoryStore(path, () => {})
    await store.load()
    await store.save(saved(30))
    await mkdir(join(path, 'memory.json.tmp'))
    await assert.rejects(store.save(saved(70)))
    assert.equal(
      JSON.parse(await readFile(join(path, 'memory.json'), 'utf8')).affection,
      30,
    )
    await rm(join(path, 'memory.json.tmp'), { recursive: true })
    await store.save(saved(69))
    assert.equal((await new MemoryStore(path).load()).affection, 69)
  })
})

test('reset removes owned saves, backups, quarantines and legacy marker, preserving unrelated userData', async () => {
  await directory(async (path) => {
    const store = new MemoryStore(path, () => {})
    await store.load()
    await store.save(saved(70))
    await writeFile(join(path, 'memory.json'), 'bad')
    await store.load()
    await writeFile(join(path, 'welcome-seen.marker'), '')
    await writeFile(join(path, 'keep.txt'), 'keep')
    await store.reset()
    assert.deepEqual(await readdir(path), ['keep.txt'])
    assert.deepEqual(await new MemoryStore(path).load(), defaultMemory())
  })
})

test('active time excludes sleep and offline gaps, is idempotent on power events and resumes from zero process clock', () => {
  const clock = new FakeClock()
  const session = new MemorySession(defaultMemory(), clock.now, stamp)
  clock.advance(5000)
  session.power(true)
  session.power(true)
  clock.advance(86400000)
  session.power(false)
  session.power(false)
  clock.advance(2000)
  const state = session.snapshot()
  assert.equal(state.totalActiveMs, 7000)
  const nextClock = new FakeClock()
  const next = new MemorySession(
    state,
    nextClock.now,
    '2027-01-01T00:00:00.000Z',
  )
  assert.equal(next.snapshot().totalActiveMs, 7000)
  nextClock.advance(1000)
  assert.equal(next.snapshot().totalActiveMs, 8000)
  assert.equal(next.snapshot().lastLaunchedAt, '2027-01-01T00:00:00.000Z')
})

test('interaction and affection cooldowns survive restart and offline time without decay or spam gains', () => {
  const clock = new FakeClock()
  const session = new MemorySession(saved(69), clock.now, stamp)
  session.action('reading')
  assert.equal(session.interact().affection, 70)
  for (let i = 0; i < 100; i++) session.interact()
  assert.equal(session.snapshot().interactionCount, 1)
  const next = new MemorySession(session.snapshot(), clock.now, stamp)
  assert.equal(next.interact().affection, 70)
  assert.equal(next.snapshot().interactionCount, 1)
  next.power(true)
  clock.advance(86400000)
  next.power(false)
  assert.equal(next.interact().interactionCount, 1)
  clock.advance(3000)
  assert.equal(next.interact().interactionCount, 2)
  assert.equal(next.snapshot().affection, 70)
  clock.advance(57000)
  assert.equal(next.interact().affection, 71)
  assert.equal(next.snapshot().relationshipStage, 'close')
  const copy = next.snapshot()
  copy.affection = 0
  assert.equal(next.snapshot().affection, 71)
})

test('sleeping interactions use fifteen seconds and initial saved action resumes only on first start', () => {
  const clock = new FakeClock()
  const session = new MemorySession(defaultMemory(), clock.now, stamp)
  session.action('sleeping')
  session.interact()
  clock.advance(14999)
  assert.equal(session.interact().interactionCount, 1)
  clock.advance(1)
  assert.equal(session.interact().interactionCount, 2)
  const engine = new BehaviorEngine({
    clock,
    initialAction: 'reading',
    random: () => 0,
  })
  engine.start()
  assert.equal(engine.getSnapshot().current.action, 'reading')
  engine.stop()
  engine.start()
  assert.equal(engine.getSnapshot().current.action, 'idle')
  engine.dispose()
})

test('outfit choice round-trips while old or unknown v1 IDs normalize without resetting memory', async () => {
  await directory(async (path) => {
    const store = new MemoryStore(path)
    const state = saved(70)
    state.interactionCount = 12
    state.settings.outfitId = 'loungewear'
    await store.save(state)
    assert.equal(
      (await new MemoryStore(path).load()).settings.outfitId,
      'loungewear',
    )
    for (const id of [undefined, 'removed-outfit']) {
      state.settings.outfitId = id
      await writeFile(join(path, 'memory.json'), JSON.stringify(state))
      const reloaded = new MemoryStore(path)
      const result = await reloaded.load()
      assert.equal(result.settings.outfitId, 'default')
      assert.equal(result.affection, 70)
      assert.equal(result.interactionCount, 12)
      assert.equal(reloaded.recovery, 'none')
    }
  })
})
