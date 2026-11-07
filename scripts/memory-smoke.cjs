const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

const directory = mkdtempSync(join(tmpdir(), 'kanojo-restart-'))
try {
  for (const phase of ['write', 'read', 'reset', 'after-reset']) {
    const result = spawnSync(
      require('electron'),
      [join(__dirname, 'memory-process.cjs'), directory, phase],
      {
        encoding: 'utf8',
        timeout: 40000,
      },
    )
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    assert.equal(
      result.status,
      0,
      `Memory process failed: ${phase}; ${result.error ?? ''}`,
    )
    const saved = JSON.parse(
      readFileSync(join(directory, 'memory.json'), 'utf8'),
    )
    if (phase === 'write') {
      assert.equal(saved.affection, 1)
      assert.equal(saved.interactionCount, 1)
      assert.equal(saved.lastAction, 'reading')
      assert.ok(saved.totalActiveMs > 0)
      assert.equal(saved.settings.alwaysOnTop, false)
      assert.equal(saved.settings.clickThrough, false)
      // Fixed affinity simulates an established relationship without hours of clicking.
      saved.affection = 70
      saved.relationshipStage = 'close'
      saved.lastLaunchedAt = '2000-01-01T00:00:00.000Z'
      writeFileSync(join(directory, 'memory.json'), JSON.stringify(saved))
    }
    if (phase === 'reset' || phase === 'after-reset') {
      assert.equal(saved.affection, 0)
      assert.equal(saved.interactionCount, 0)
      assert.equal(saved.settings.alwaysOnTop, true)
    }
  }
  console.log(
    'Memory smoke passed: actual restart, restored relationship/action/settings/bounds, confirmed reset',
  )
} finally {
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
