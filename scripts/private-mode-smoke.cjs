const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const directory = mkdtempSync(join(tmpdir(), 'kanojo-private-'))
const preview = join(tmpdir(), 'kanojo-private-preview.png')
try {
  for (const phase of ['edit', 'restore', 'corrupt']) {
    if (phase === 'corrupt') {
      const invalid = JSON.parse(
        readFileSync(join(directory, 'memory.json'), 'utf8'),
      )
      invalid.settings.privateHideOnBlur = 'false'
      writeFileSync(join(directory, 'memory.json'), JSON.stringify(invalid))
      // A bad backup must also fall back safely, without restoring permission.
      const { readdirSync } = require('node:fs')
      for (const name of readdirSync(directory))
        if (name.startsWith('memory') && name !== 'memory.json')
          writeFileSync(join(directory, name), 'bad save')
    }
    const result = spawnSync(
      require('electron'),
      [join(__dirname, 'private-mode-process.cjs'), directory, phase, preview],
      { encoding: 'utf8', timeout: 60000 },
    )
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    assert.equal(
      result.status,
      0,
      `Private-mode process failed: ${phase}; ${result.error ?? ''}`,
    )
    const saved = JSON.parse(
      readFileSync(join(directory, 'memory.json'), 'utf8'),
    )
    assert.equal(saved.settings.privateHideOnBlur, phase === 'corrupt')
    assert.equal(saved.affection, 0)
    assert.equal(saved.interactionCount, 0)
    assert.equal('privateMode' in saved, false)
    assert.equal('session' in saved, false)
  }
  console.log(
    'Private-mode smoke passed: entry, consent, blur, exits, security, restart and corrupt saves',
  )
  console.log('Private-mode preview:', preview)
} finally {
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
