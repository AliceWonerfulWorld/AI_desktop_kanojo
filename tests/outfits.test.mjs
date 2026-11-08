import { URL } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  validateCharacterManifest,
  availableOutfit,
} from '../src/shared/character-manifest.ts'
import {
  isCharacterVisualState,
  actions,
  expressions,
} from '../src/shared/character-state.ts'
import { assetCandidates } from '../src/renderer/src/character/asset-selection.ts'
import { defaultMemory, validateMemory } from '../src/shared/memory-state.ts'
import { validateSettingsPatch } from '../src/shared/presentation.ts'
import { MemorySession } from '../src/main/memory-session.ts'
const manifest = JSON.parse(
  readFileSync(new URL('../assets/character/manifest.json', import.meta.url)),
)
const fixture = () => ({
  schemaVersion: 1,
  outfits: [
    { id: 'default', label: '普段着', status: 'ready' },
    { id: 'loungewear', label: '部屋着', status: 'ready' },
  ],
  assets: [
    {
      id: 'default-neutral',
      file: 'koharu/png/default.png',
      outfitId: 'default',
      action: 'idle',
      expression: 'neutral',
    },
    {
      id: 'lounge-neutral',
      file: 'koharu/png/lounge.png',
      outfitId: 'loungewear',
      action: 'idle',
      expression: 'neutral',
    },
  ],
})
test('registry keeps six default expressions and missing loungewear explicitly pending', () => {
  const registry = validateCharacterManifest(manifest)
  assert.equal(registry.assets.length, 6)
  assert.ok(
    registry.assets.every(
      (a) => a.outfitId === 'default' && !a.file.includes('trial'),
    ),
  )
  assert.deepEqual(
    registry.outfits.map((o) => o.available),
    [true, false],
  )
  assert.equal(availableOutfit('loungewear', registry.outfits), 'default')
  assert.equal(availableOutfit('deleted', registry.outfits), 'default')
  assert.equal(
    availableOutfit('loungewear', validateCharacterManifest(fixture()).outfits),
    'loungewear',
  )
})
test('registry rejects bad IDs, paths, duplicate semantic states, missing neutrals and trial art', () => {
  for (const mutate of [
    (m) => (m.outfits[0].status = 'pending'),
    (m) => (m.outfits[1].id = 'invalid'),
    (m) => (m.outfits[1].id = 'default'),
    (m) => (m.assets[1].file = '../secret.png'),
    (m) => (m.assets[1].file = 'koharu/png/loungewear_shy_trial.png'),
    (m) => (m.assets[1].outfitId = 'invalid'),
    (m) => (m.assets[1].expression = 'smile'),
    (m) =>
      m.assets.push({
        ...m.assets[0],
        id: 'duplicate',
        file: 'koharu/png/duplicate.png',
      }),
    (m) => (m.assets[1].id = m.assets[0].id),
    (m) => (m.assets[1].file = m.assets[0].file),
    (m) => (m.assets[1].expression = 'unknown'),
  ]) {
    const m = fixture()
    mutate(m)
    assert.throws(() => validateCharacterManifest(m))
  }
})
test('all loungewear states use only own neutral when expressions are missing, never default or smile', () => {
  const assets = [
    ...validateCharacterManifest(fixture()).assets.map((a) => ({
      ...a,
      url: a.file,
    })),
    {
      id: 'lounge-smile',
      outfitId: 'loungewear',
      action: 'idle',
      expression: 'smile',
      url: 'smile',
    },
  ]
  for (const action of actions)
    for (const expression of expressions) {
      const candidates = assetCandidates(
        { action, expression, outfitId: 'loungewear' },
        assets,
      )
      assert.ok(candidates.length)
      assert.ok(candidates.every((a) => a.outfitId === 'loungewear'))
      if (['shy', 'affectionate', 'surprised', 'sleepy'].includes(expression))
        assert.deepEqual(
          candidates.map((a) => a.id),
          ['lounge-neutral'],
        )
    }
  assert.deepEqual(
    assetCandidates(
      { action: 'idle', expression: 'shy', outfitId: 'loungewear' },
      assets.filter((a) => a.outfitId === 'default'),
    ),
    [],
  )
  assert.equal(
    isCharacterVisualState({
      action: 'idle',
      expression: 'neutral',
      outfitId: 'invalid',
    }),
    false,
  )
})
test('old v1, unknown or malformed outfit selections preserve the rest of a save; generic settings cannot bypass preparation', () => {
  for (const value of [undefined, 'deleted', null, {}, 3]) {
    const old = defaultMemory()
    old.affection = 70
    old.relationshipStage = 'close'
    old.settings.paused = true
    old.settings.outfitId = value
    const result = validateMemory(old)
    assert.equal(result.settings.outfitId, 'default')
    assert.equal(result.affection, 70)
    assert.equal(result.settings.paused, true)
  }
  const state = defaultMemory()
  state.settings.outfitId = 'loungewear'
  assert.equal(validateMemory(state).settings.outfitId, 'loungewear')
  assert.throws(() => validateSettingsPatch({ outfitId: 'loungewear' }))
  const session = new MemorySession(state, () => 0, '2026-11-08T00:00:00Z')
  session.settings({ ...session.snapshot().settings, outfitId: 'default' })
  assert.equal(session.snapshot().affection, 0)
  assert.equal(session.snapshot().interactionCount, 0)
})
