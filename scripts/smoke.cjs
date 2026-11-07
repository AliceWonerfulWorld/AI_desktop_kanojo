const assert = require('node:assert/strict')
const { once } = require('node:events')
const { app, Tray, screen, ipcMain } = require('electron')

async function waitFor(condition) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.ok(condition(), 'Native window visibility did not settle')
}

let completed = false
app.on('will-quit', () => {
  if (!completed) {
    console.error(
      'Smoke check did not complete. Close the running app before testing.',
    )
    app.exit(1)
  }
})

let menu
let tray
const originalSetContextMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (value) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- Track the native Tray created by the real application.
  tray = this
  menu = value
  return originalSetContextMenu.call(this, value)
}
const timeout = setTimeout(() => {
  console.error('Smoke check timed out')
  app.exit(1)
}, 30000)

app.on('browser-window-created', (_event, window) => {
  let ignoringMouse = false
  const originalIgnore = window.setIgnoreMouseEvents.bind(window)
  window.setIgnoreMouseEvents = (ignore, options) => {
    ignoringMouse = ignore
    originalIgnore(ignore, options)
  }
  window.webContents.once('did-fail-load', (_event, code, description) => {
    console.error('Renderer load failed', code, description)
    app.exit(1)
  })
  window.webContents.once('did-finish-load', async () => {
    try {
      if (!window.isVisible()) await once(window, 'ready-to-show')
      await waitFor(() => window.isVisible())
      const preferences = window.webContents.getLastWebPreferences()
      assert.equal(preferences.nodeIntegration, false)
      assert.equal(preferences.contextIsolation, true)
      assert.equal(preferences.sandbox, true)
      assert.equal(window.hasShadow(), false)
      assert.equal(window.isAlwaysOnTop(), true)
      assert.equal(window.isResizable(), false)
      assert.ok(tray && !tray.isDestroyed())
      const state = await window.webContents.executeJavaScript(`({
        status: document.querySelector('#status').textContent,
        electron: window.desktop?.versions.electron,
        requireType: typeof require,
        processType: typeof process,
        background: getComputedStyle(document.body).backgroundColor,
        marginHit: !!document.elementFromPoint(10, 10)?.closest('[data-hit]'),
        characterHit: !!document.elementFromPoint(innerWidth / 2, innerHeight * 0.6)?.closest('[data-hit]')
      })`)
      assert.match(state.status, /接続を確認しました/)
      assert.equal(state.electron, process.versions.electron)
      assert.equal(state.requireType, 'undefined')
      assert.equal(state.processType, 'undefined')
      assert.equal(state.background, 'rgba(0, 0, 0, 0)')
      assert.equal(state.marginHit, false)
      assert.equal(state.characterHit, true)

      const ipc = async (channel, expression) => {
        const delivered = once(ipcMain, channel)
        await window.webContents.executeJavaScript(expression)
        await delivered
      }
      const forwarding =
        process.platform === 'win32' || process.platform === 'darwin'
      await ipc(
        'desktop:pointer',
        'window.desktop.setPointerInteractive(false)',
      )
      assert.equal(ignoringMouse, forwarding)
      await ipc('desktop:pointer', 'window.desktop.setPointerInteractive(true)')
      assert.equal(ignoringMouse, false)
      await ipc(
        'desktop:pointer',
        'window.desktop.setPointerInteractive("invalid")',
      )
      assert.equal(ignoringMouse, false, 'invalid payload must be ignored')
      const originalCursor = screen.getCursorScreenPoint
      const beforeDrag = window.getBounds()
      const areaForDrag = screen.getDisplayMatching(beforeDrag).workArea
      let cursor = { x: areaForDrag.x + 200, y: areaForDrag.y + 200 }
      screen.getCursorScreenPoint = () => cursor
      await ipc('desktop:drag', 'window.desktop.setDragging(true)')
      assert.equal(ignoringMouse, false, 'drag must retain mouse input')
      cursor = { x: cursor.x + 4, y: cursor.y }
      await new Promise((resolve) => setTimeout(resolve, 50))
      assert.deepEqual(
        window.getBounds(),
        beforeDrag,
        'sub-threshold motion is a click',
      )
      cursor = { x: cursor.x - 84, y: cursor.y - 60 }
      await waitFor(
        () =>
          window.getBounds().x !== beforeDrag.x ||
          window.getBounds().y !== beforeDrag.y,
      )
      await ipc('desktop:drag', 'window.desktop.setDragging(false)')
      const afterDrag = window.getBounds()
      cursor = { x: cursor.x + 100, y: cursor.y + 100 }
      await new Promise((resolve) => setTimeout(resolve, 50))
      assert.deepEqual(
        window.getBounds(),
        afterDrag,
        'pointer release stops movement',
      )
      screen.getCursorScreenPoint = originalCursor

      const item = (label) => {
        const found = menu.items.find((entry) => entry.label === label)
        assert.ok(found, `Missing menu item: ${label}`)
        return found
      }
      const top = item('常に手前に表示')
      top.click(top)
      assert.equal(window.isAlwaysOnTop(), false)
      const passThrough = item('透明領域をクリック透過（試験機能）')
      passThrough.click(passThrough)
      await ipc(
        'desktop:pointer',
        'window.desktop.setPointerInteractive(false)',
      )
      assert.equal(ignoringMouse, false, 'fallback disables click-through')
      item('非表示').click()
      await waitFor(() => !window.isVisible())
      assert.equal(item('表示').enabled, true)
      item('表示').click()
      await waitFor(() => window.isVisible())
      window.setPosition(-30000, -30000)
      item('主画面の右下に戻す').click()
      const bounds = window.getBounds()
      const area = screen.getPrimaryDisplay().workArea
      assert.ok(bounds.x >= area.x && bounds.y >= area.y)
      assert.ok(bounds.x + bounds.width <= area.x + area.width)
      assert.ok(bounds.y + bounds.height <= area.y + area.height)
      window.close()
      assert.equal(
        window.isDestroyed(),
        false,
        'close must hide, preserving tray recovery',
      )
      await waitFor(() => !window.isVisible())
      item('表示').click()
      await waitFor(() => window.isVisible())
      console.log(
        'Smoke check passed: secure transparent renderer, hit regions, IPC, tray menus, recovery',
      )
      completed = true
      clearTimeout(timeout)
      // Exercise the real Quit path, including native tray and window cleanup.
      item('終了').click()
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})

require('../out/main/index.js')
