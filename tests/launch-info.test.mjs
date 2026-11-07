import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadLaunchInfo } from '../src/main/launch-info.ts'

test('first launch uses an exclusive presence marker, never offline timestamps or counters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kanojo-launch-test-'))
  try {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => loadLaunchInfo(directory)),
    )
    assert.equal(results.filter((result) => result.firstLaunch).length, 1)
    assert.deepEqual(await loadLaunchInfo(directory), { firstLaunch: false })
    assert.deepEqual(await readdir(directory), ['welcome-seen.marker'])
    assert.equal(
      await readFile(join(directory, 'welcome-seen.marker'), 'utf8'),
      '',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('unavailable user-data storage falls back to an ordinary greeting without blocking startup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kanojo-launch-error-'))
  try {
    const blocked = join(directory, 'file')
    await writeFile(blocked, '')
    assert.deepEqual(await loadLaunchInfo(join(blocked, 'nested'), () => {}), {
      firstLaunch: false,
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
