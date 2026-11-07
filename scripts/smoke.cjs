const assert = require('node:assert/strict')
const { app } = require('electron')

const timeout = setTimeout(() => {
  console.error('Smoke check timed out')
  app.exit(1)
}, 30000)

app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-fail-load', (_event, code, description) => {
    console.error('Renderer load failed', code, description)
    app.exit(1)
  })
  window.webContents.once('did-finish-load', async () => {
    try {
      const preferences = window.webContents.getLastWebPreferences()
      assert.equal(preferences.nodeIntegration, false)
      assert.equal(preferences.contextIsolation, true)
      assert.equal(preferences.sandbox, true)
      const state = await window.webContents.executeJavaScript(`({
        status: document.querySelector('#status').textContent,
        electron: window.desktop?.versions.electron,
        requireType: typeof require,
        processType: typeof process
      })`)
      assert.match(state.status, /接続を確認しました/)
      assert.equal(state.electron, process.versions.electron)
      assert.equal(state.requireType, 'undefined')
      assert.equal(state.processType, 'undefined')
      console.log(
        'Smoke check passed: renderer, preload, sandbox, context isolation',
      )
      clearTimeout(timeout)
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})

require('../out/main/index.js')
