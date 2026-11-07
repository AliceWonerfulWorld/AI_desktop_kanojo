const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { once } = require('node:events')
const { app, Tray, dialog, screen } = require('electron')

const [directory, phase] = process.argv.slice(2)
app.setPath('userData', directory)
const savedBefore =
  phase === 'write'
    ? undefined
    : JSON.parse(readFileSync(join(directory, 'memory.json'), 'utf8'))
let menu
const setMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (value) {
  menu = value
  return setMenu.call(this, value)
}
dialog.showErrorBox = (...args) => {
  throw new Error(`Unexpected save error: ${args.join(' ')}`)
}
const timeout = setTimeout(() => {
  console.error('Memory process timed out', phase)
  app.exit(1)
}, 30000)
app.on('quit', () => clearTimeout(timeout))
async function waitFor(condition) {
  for (let i = 0; i < 200; i++) {
    try {
      if (await condition()) return
    } catch {
      /* Renderer may be reloading after reset. */
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Renderer did not settle')
}
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const evaluate = (expression) =>
        window.webContents.executeJavaScript(expression)
      await waitFor(() =>
        evaluate("document.body.dataset.lifecycleReady === 'true'"),
      )
      const memory = () => evaluate('window.desktop.getMemory()')
      const find = (label) => {
        const item = menu.items.find((entry) => entry.label === label)
        assert.ok(item, label)
        return item
      }
      if (phase === 'write') {
        assert.equal((await memory()).affection, 0)
        assert.equal(
          (await evaluate('window.desktop.recordInteraction()'))
            .interactionCount,
          0,
          'IPC without a native click must not award credit',
        )
        await evaluate("window.desktop.recordAction('reading')")
        await waitFor(async () => (await memory()).lastAction === 'reading')
        const cursor = screen.getCursorScreenPoint()
        screen.getCursorScreenPoint = () => cursor
        await evaluate('window.desktop.setDragging(true)')
        await new Promise((resolve) => setTimeout(resolve, 30))
        assert.equal(await evaluate('window.desktop.finishDrag()'), 'click')
        const state = await evaluate('window.desktop.recordInteraction()')
        assert.equal(state.affection, 1)
        assert.equal(state.interactionCount, 1)
        assert.equal(
          (await evaluate('window.desktop.recordInteraction()'))
            .interactionCount,
          1,
        )
        const area = screen.getPrimaryDisplay().workArea
        window.setBounds({
          x: area.x + 24,
          y: area.y + 24,
          width: 340,
          height: 580,
        })
        find('常に手前に表示').click({ checked: false })
        find('透明領域をクリック透過（試験機能）').click({ checked: false })
        await waitFor(
          async () => (await memory()).settings.windowBounds?.x === area.x + 24,
        )
      } else if (phase === 'read') {
        const state = await memory()
        assert.equal(state.affection, 70)
        assert.equal(state.relationshipStage, 'close')
        assert.equal(state.interactionCount, 1)
        assert.equal(state.lastAction, 'reading')
        assert.equal(window.isAlwaysOnTop(), false)
        assert.equal(find('透明領域をクリック透過（試験機能）').checked, false)
        assert.deepEqual(window.getBounds(), savedBefore.settings.windowBounds)
        assert.ok(state.totalActiveMs >= savedBefore.totalActiveMs)
        assert.ok(
          state.totalActiveMs - savedBefore.totalActiveMs < 10000,
          'offline time must not be counted',
        )
        assert.match(
          await evaluate("document.querySelector('#greeting').textContent"),
          /一緒|隣|あったか/,
        )
        assert.equal(
          await evaluate("document.querySelector('#character').dataset.action"),
          'reading',
        )
      } else if (phase === 'reset') {
        dialog.showMessageBox = async () => ({
          response: 0,
          checkboxChecked: false,
        })
        await find('生活記憶・設定を初期化…').click()
        assert.equal(
          (await memory()).affection,
          70,
          'cancelling reset must preserve memory',
        )
        dialog.showMessageBox = async () => ({
          response: 1,
          checkboxChecked: false,
        })
        const loaded = once(window.webContents, 'did-finish-load')
        await find('生活記憶・設定を初期化…').click()
        await loaded
        await waitFor(() =>
          evaluate("document.body.dataset.lifecycleReady === 'true'"),
        )
        const state = await memory()
        assert.equal(state.affection, 0)
        assert.equal(state.interactionCount, 0)
        assert.equal(window.isAlwaysOnTop(), true)
        assert.equal(
          (await evaluate('window.desktop.getLaunchInfo()')).firstLaunch,
          true,
        )
      } else {
        assert.equal((await memory()).affection, 0)
        assert.equal((await memory()).interactionCount, 0)
        assert.equal(
          (await evaluate('window.desktop.getLaunchInfo()')).firstLaunch,
          false,
        )
      }
      console.log(`Memory process passed: ${phase}`)
      app.quit()
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})
require('../out/main/index.js')
