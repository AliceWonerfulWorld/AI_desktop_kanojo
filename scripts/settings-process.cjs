const assert = require('node:assert/strict')
const { writeFileSync } = require('node:fs')
const { once } = require('node:events')
const { app, Tray, BrowserWindow, screen, powerMonitor } = require('electron')
const [directory, phase, preview] = process.argv.slice(2)
app.setPath('userData', directory)
let menu
const setMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (value) {
  menu = value
  return setMenu.call(this, value)
}
const timeout = setTimeout(() => {
  console.error('Settings process timed out', phase)
  app.exit(1)
}, 30000)
app.on('quit', () => clearTimeout(timeout))
async function waitFor(test) {
  for (let i = 0; i < 250; i++) {
    try {
      if (await test()) return
    } catch {
      /* Window may still be loading. */
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Settings state did not settle')
}
let desktop
app.on('browser-window-created', (_event, window) => {
  if (desktop) return
  desktop = window
  const evaluate = (expression) =>
    window.webContents.executeJavaScript(expression)
  window.webContents.once('dom-ready', () => {
    void evaluate(
      "window.__states=[];window.__clicks=[];addEventListener('character-behavior',e=>window.__states.push(e.detail.snapshot.status));addEventListener('character-interaction',e=>window.__clicks.push(e.detail))",
    )
  })
  window.webContents.once('did-finish-load', async () => {
    try {
      await waitFor(() =>
        evaluate("document.body.dataset.lifecycleReady==='true'"),
      )
      const running = (state) =>
        waitFor(
          async () => (await evaluate('window.__states.at(-1)')) === state,
        )
      const open = async () => {
        const created = once(app, 'browser-window-created')
        menu.items.find((item) => item.label === '設定…').click()
        const [, settings] = await created
        await waitFor(() =>
          settings.webContents.executeJavaScript(
            "typeof settings==='object' && !document.querySelector('#controls').disabled",
          ),
        )
        return settings
      }
      const settings = await open()
      const ui = (expression) =>
        settings.webContents.executeJavaScript(expression)
      const update = async (id, value) => {
        await ui(
          `{const input=document.querySelector(${JSON.stringify(id)});input.${id === '#scale' ? 'value' : 'checked'}=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}))}`,
        )
        await waitFor(() =>
          ui(
            "document.querySelector('#status').textContent.includes('反映しました')",
          ),
        )
      }
      const preferences = settings.webContents.getLastWebPreferences()
      assert.equal(preferences.nodeIntegration, false)
      assert.equal(preferences.contextIsolation, true)
      assert.equal(preferences.sandbox, true)
      assert.deepEqual(
        await ui(
          '({desktop:typeof window.desktop,node:typeof require,api:typeof window.settings})',
        ),
        { desktop: 'undefined', node: 'undefined', api: 'object' },
      )
      for (const patch of [
        { scale: 3 },
        { paused: 'yes' },
        { windowBounds: {} },
        { affection: 100 },
      ])
        assert.equal(
          await ui(
            `window.settings.update(${JSON.stringify(patch)}).then(()=>false,()=>true)`,
          ),
          true,
        )
      menu.items.find((item) => item.label === '設定…').click()
      assert.equal(
        BrowserWindow.getAllWindows().length,
        2,
        'settings should be a singleton',
      )
      if (phase === 'edit') {
        await update('#always-on-top', false)
        assert.equal(window.isAlwaysOnTop(), false)
        const feet = window.getBounds().y + window.getBounds().height
        await update('#scale', '0.75')
        assert.equal(window.getBounds().height, 463)
        assert.equal(window.getBounds().y + window.getBounds().height, feet)
        assert.equal(
          await ui("document.querySelector('#scale-value').value"),
          '75%',
        )
        await update('#spontaneous', false)
        // Settings and character are separate renderers; wait for the broadcast to apply.
        await waitFor(() =>
          evaluate("document.querySelector('#greeting').hidden"),
        )
        window.show()
        window.focus()
        window.webContents.focus()
        await waitFor(() => window.isFocused())
        const point = await evaluate(
          "(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()",
        )
        const nativeCursor = screen.getCursorScreenPoint,
          cursor = nativeCursor()
        screen.getCursorScreenPoint = () => cursor
        for (const type of ['mouseMove', 'mouseDown', 'mouseUp'])
          window.webContents.sendInputEvent({
            type,
            x: point.x,
            y: point.y,
            button: 'left',
            clickCount: 1,
          })
        await waitFor(
          async () => (await evaluate('window.__clicks.length')) === 1,
        )
        assert.equal(
          await evaluate("document.querySelector('#greeting').hidden"),
          false,
          'explicit click still replies with spontaneous text off',
        )
        screen.getCursorScreenPoint = nativeCursor
        await update('#paused', true)
        await running('paused')
        assert.equal(
          await evaluate("document.querySelector('#greeting').hidden"),
          true,
        )
        powerMonitor.emit('suspend')
        await update('#paused', false)
        await running('paused')
        await ui("document.querySelector('#visibility').click()")
        await waitFor(() => !window.isVisible())
        powerMonitor.emit('resume')
        await running('paused')
        await ui("document.querySelector('#visibility').click()")
        await waitFor(() => window.isVisible())
        await running('running')
        await update('#show-on-startup', false)
        await update('#paused', true)
        await running('paused')
        writeFileSync(
          preview,
          (await settings.webContents.capturePage()).toPNG(),
        )
      } else {
        assert.equal(
          window.isVisible(),
          false,
          'hidden startup must not show the character while opening settings',
        )
        assert.equal(window.isAlwaysOnTop(), false)
        assert.equal(window.getBounds().height, 463)
        const state = await ui('window.settings.getState()')
        assert.equal(state.settings.showOnStartup, false)
        assert.equal(state.settings.paused, true)
        assert.equal(
          await ui("document.querySelector('#paused').checked"),
          true,
        )
        await ui("document.querySelector('#visibility').click()")
        await waitFor(() => window.isVisible())
        await running('paused')
        await update('#paused', false)
        await running('running')
        assert.equal(
          await evaluate("document.querySelector('#greeting').hidden"),
          true,
        )
      }
      settings.close()
      assert.equal(
        window.isDestroyed(),
        false,
        'closing settings must not quit the resident app',
      )
      console.log('Settings process passed:', phase)
      app.quit()
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})
require('../out/main/index.js')
