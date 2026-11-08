const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const directory = mkdtempSync(join(tmpdir(), 'kanojo-settings-'))
const preview = join(tmpdir(), 'kanojo-settings-preview.png')
try {
  for (const phase of ['edit', 'restore']) {
    const result = spawnSync(
      require('electron'),
      [join(__dirname, 'settings-process.cjs'), directory, phase, preview],
      { encoding: 'utf8', timeout: 40000 },
    )
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    assert.equal(
      result.status,
      0,
      `Settings process failed: ${phase}; ${result.error ?? ''}`,
    )
    const state = JSON.parse(
      readFileSync(join(directory, 'memory.json'), 'utf8'),
    )
    assert.equal(state.settings.outfitId, 'default')
    assert.equal(state.settings.scale, 0.75)
    assert.equal(state.settings.alwaysOnTop, false)
    assert.equal(state.settings.spontaneousDialogue, false)
    assert.equal(state.settings.showOnStartup, false)
    assert.equal(state.settings.paused, phase === 'edit')
    if (phase === 'edit') {
      // A removed/unavailable saved outfit must normalize on real app startup.
      state.settings.outfitId = 'loungewear'
      writeFileSync(join(directory, 'memory.json'), JSON.stringify(state))
    }
  }
  console.log(
    'Settings smoke passed: actual controls, quiet mode, scale, hidden startup and restart',
  )
  console.log('Settings preview:', preview)
} finally {
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
