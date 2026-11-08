const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const directory = mkdtempSync(join(tmpdir(), 'kanojo-events-'))
const preview = join(tmpdir(), 'kanojo-event-preview.png')
try {
  for (const phase of ['interrupt', 'resume', 'failure']) {
    const result = spawnSync(
      require('electron'),
      [join(__dirname, 'events-process.cjs'), directory, phase, preview],
      { encoding: 'utf8', timeout: 60000 },
    )
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    assert.equal(
      result.status,
      0,
      `Event process failed: ${phase}; ${result.error ?? ''}`,
    )
    const saved = JSON.parse(
      readFileSync(join(directory, 'memory.json'), 'utf8'),
    )
    assert.equal(saved.affection, 0)
    assert.equal(saved.interactionCount, 0)
    assert.equal(
      saved.events['tea-sample'].node,
      phase === 'interrupt' ? 'book' : phase === 'resume' ? 'end' : 'hello',
    )
    assert.equal(saved.events['tea-sample'].completed, phase !== 'interrupt')
  }
  console.log(
    'Event smoke passed: playback, choices, CG fallback, explicit restart, pause, security, save failure and normal return',
  )
  console.log('Event preview:', preview)
} finally {
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
