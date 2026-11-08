import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PrivateModeSession,
  isPrivateModeCommand,
} from '../src/shared/private-mode.ts'
import { defaultMemory, validateMemory } from '../src/shared/memory-state.ts'
import { validateSettingsPatch } from '../src/shared/presentation.ts'

test('entry needs exact consent for a live confirmation; stale and duplicate confirms are rejected', () => {
  const mode = new PrivateModeSession()
  assert.equal(mode.snapshot().phase, 'closed')
  assert.equal(mode.confirm(true, 0), false)
  mode.request()
  const first = mode.snapshot()
  mode.request()
  assert.equal(mode.snapshot().session, first.session)
  for (const value of [false, 'true', 1, null, {}])
    assert.equal(mode.confirm(value, first.session), false)
  assert.equal(mode.confirm(true, first.session), true)
  assert.equal(mode.confirm(true, first.session), false)
  mode.close()
  mode.request()
  assert.equal(mode.confirm(true, first.session), false)
  assert.equal(mode.snapshot().phase, 'confirmation')
  assert.ok(mode.snapshot().revision > first.revision)
})
test('blur ON revokes entry; OFF pauses until explicit resume and never grants consent', () => {
  const mode = new PrivateModeSession()
  mode.request()
  mode.blur(false)
  assert.equal(
    mode.snapshot().phase,
    'closed',
    'confirmation cancels on blur even with auto-hide OFF',
  )
  mode.request()
  const id = mode.snapshot().session
  mode.confirm(true, id)
  mode.blur(false)
  assert.equal(mode.snapshot().phase, 'active')
  assert.equal(mode.snapshot().paused, true)
  mode.resume(id - 1)
  assert.equal(mode.snapshot().paused, true)
  mode.resume(id)
  assert.equal(mode.snapshot().paused, false)
  mode.blur(true)
  assert.equal(mode.snapshot().phase, 'closed')
  mode.resume(id)
  assert.equal(mode.snapshot().phase, 'closed')
})
test('unconditional exit and a fresh session cannot restore private permission for either blur setting', () => {
  for (const hide of [true, false]) {
    const mode = new PrivateModeSession()
    mode.request()
    mode.confirm(true, mode.snapshot().session)
    mode.blur(hide)
    mode.close()
    assert.equal(mode.snapshot().phase, 'closed')
    assert.equal(new PrivateModeSession().snapshot().phase, 'closed')
    mode.request()
    assert.equal(mode.snapshot().phase, 'confirmation')
    const snapshot = mode.snapshot()
    snapshot.phase = 'active'
    assert.equal(mode.snapshot().phase, 'confirmation')
  }
})
test('private IPC only accepts known commands and exact self-report payloads', () => {
  for (const value of [
    null,
    [],
    {},
    { kind: 'confirm', session: 1, accepted: false },
    { kind: 'confirm', session: 1, accepted: 'true' },
    { kind: 'resume', session: NaN },
    { kind: 'hide', session: 0 },
    { kind: 'file', session: 1 },
    { kind: 'hide', session: 1, path: '/tmp' },
    { kind: 'resume', session: 1, accepted: true },
  ])
    assert.equal(isPrivateModeCommand(value), false)
  for (const kind of ['confirm', 'resume', 'return', 'hide'])
    assert.equal(
      isPrivateModeCommand({
        kind,
        session: 1,
        ...(kind === 'confirm' ? { accepted: true } : {}),
      }),
      true,
    )
})
test('v1 migration defaults to hide ON, preserves OFF and memory, rejects corrupt flags and drops permission', () => {
  const old = defaultMemory()
  old.affection = 40
  old.relationshipStage = 'familiar'
  old.interactionCount = 8
  delete old.settings.privateHideOnBlur
  old.privateMode = 'active'
  const migrated = validateMemory(old)
  assert.equal(migrated.settings.privateHideOnBlur, true)
  assert.equal(migrated.affection, 40)
  assert.equal(migrated.interactionCount, 8)
  assert.equal('privateMode' in migrated, false)
  migrated.settings.privateHideOnBlur = false
  assert.equal(validateMemory(migrated).settings.privateHideOnBlur, false)
  migrated.settings.privateHideOnBlur = 'false'
  assert.throws(() => validateMemory(migrated))
  assert.deepEqual(validateSettingsPatch({ privateHideOnBlur: false }), {
    privateHideOnBlur: false,
  })
  assert.throws(() => validateSettingsPatch({ privateMode: 'active' }))
  assert.throws(() => validateSettingsPatch({ privateHideOnBlur: 'false' }))
})
