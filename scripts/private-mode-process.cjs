const assert = require('node:assert/strict')
const { writeFileSync } = require('node:fs')
const {
  app,
  BrowserWindow,
  Tray,
  powerMonitor,
  ipcMain,
  dialog,
} = require('electron')
const [directory, phase, preview] = process.argv.slice(2)
app.setPath('userData', directory)
let menu
let desktop
const ignored = new Map()
const handlers = new Map()
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => {
  handlers.set(channel, listener)
  return handle(channel, listener)
}
const setMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (value) {
  menu = value
  return setMenu.call(this, value)
}
dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
const timeout = setTimeout(() => {
  console.error('Private mode timed out:', phase)
  app.exit(1)
}, 45000)
app.on('quit', () => clearTimeout(timeout))
async function waitFor(condition, description = 'state') {
  for (let i = 0; i < 300; i++) {
    try {
      if (await condition()) return
    } catch {
      /* load/close boundary */
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw Error('Private mode did not settle: ' + description)
}
app.on('browser-window-created', (_event, window) => {
  const setIgnore = window.setIgnoreMouseEvents.bind(window)
  window.setIgnoreMouseEvents = (ignore, options) => {
    ignored.set(window, ignore)
    setIgnore(ignore, options)
  }
  if (desktop) return
  desktop = window
  const evaluate = (expression) =>
    desktop.webContents.executeJavaScript(expression)
  desktop.webContents.once('dom-ready', () => {
    void evaluate(
      "window.__behavior=[];addEventListener('character-behavior', e=>__behavior.push(e.detail.snapshot))",
    )
  })
  desktop.webContents.once('did-finish-load', async () => {
    try {
      await waitFor(
        () => evaluate("document.body.dataset.lifecycleReady==='true'"),
        'desktop startup',
      )
      assert.equal(
        BrowserWindow.getAllWindows().length,
        1,
        'startup never opens a private window',
      )
      assert.equal(
        menu.items.some((item) => /成人|専用/.test(item.label)),
        false,
        'no adult entry in tray/context menu',
      )
      powerMonitor.emit('suspend')
      powerMonitor.emit('resume')
      assert.equal(BrowserWindow.getAllWindows().length, 1)
      const openSettings = async () => {
        menu.items.find((item) => item.label === '設定…').click()
        const settings = BrowserWindow.getAllWindows().find(
          (win) => win.getTitle() === '小春の設定',
        )
        await waitFor(
          () =>
            settings.webContents.executeJavaScript(
              "!document.querySelector('#controls').disabled",
            ),
          'settings',
        )
        await waitFor(
          () => settings.isVisible() && settings.isFocused(),
          'settings focus',
        )
        return settings
      }
      const settings = await openSettings()
      const ui = (expression) =>
        settings.webContents.executeJavaScript(expression)
      const saved = await ui('window.settings.getState()')
      assert.equal(saved.settings.privateHideOnBlur, phase !== 'restore')
      assert.equal(await ui('typeof window.privateMode'), 'undefined')
      assert.equal(await evaluate('typeof window.privateMode'), 'undefined')
      assert.equal(await evaluate('typeof window.settings'), 'undefined')
      const setHide = async (value) => {
        await ui(`window.settings.update({privateHideOnBlur:${value}})`)
      }
      const open = async () => {
        if (!settings.isVisible()) await openSettings()
        await ui("document.querySelector('#private-open').click()")
        let candidate
        await waitFor(() => {
          candidate = BrowserWindow.getAllWindows().find(
            (win) => win !== desktop && win !== settings,
          )
          return candidate?.isVisible()
        }, 'private window')
        await waitFor(
          () =>
            candidate.webContents.executeJavaScript(
              "document.body.dataset.phase==='confirmation'",
            ),
          'confirmation',
        )
        candidate.focus()
        await waitFor(() => candidate.isFocused(), 'private focus')
        app.emit('activate', {}, true)
        assert.equal(
          candidate.isDestroyed(),
          false,
          'delayed activation must not cancel confirmation',
        )
        return candidate
      }
      const enter = async (candidate) => {
        await candidate.webContents.executeJavaScript(
          "document.querySelector('#adult').checked=true;document.querySelector('#adult').dispatchEvent(new Event('change'));document.querySelector('#enter').click()",
        )
        await waitFor(
          () =>
            candidate.webContents.executeJavaScript(
              "document.body.dataset.phase==='active'",
            ),
          'active',
        )
        await waitFor(() => !desktop.isVisible(), 'desktop hidden')
      }
      const exitButton = async (candidate, id) => {
        await candidate.webContents
          .executeJavaScript(`document.querySelector('#${id}').click()`)
          .catch(() => {})
        await waitFor(() => candidate.isDestroyed(), 'private exit')
      }
      const openActive = async () => {
        const candidate = await open()
        await enter(candidate)
        app.emit('activate', {}, true)
        assert.equal(
          candidate.isDestroyed(),
          false,
          'delayed activation must not cancel confirmation',
        )
        return candidate
      }
      let privateWindow = await open()
      assert.equal(
        await privateWindow.webContents.executeJavaScript(
          'document.activeElement.id',
        ),
        'cancel',
      )
      assert.equal(
        await privateWindow.webContents.executeJavaScript(
          "document.querySelector('#enter').disabled",
        ),
        true,
      )
      assert.equal(
        await privateWindow.webContents.executeJavaScript(
          "document.querySelector('#private-content').hidden",
        ),
        true,
      )
      assert.equal(
        ignored.get(privateWindow),
        false,
        'private rectangle must not pass through input',
      )
      assert.equal(privateWindow.isContentProtected(), true)
      const prefs = privateWindow.webContents.getLastWebPreferences()
      assert.equal(prefs.nodeIntegration, false)
      assert.equal(prefs.contextIsolation, true)
      assert.equal(prefs.sandbox, true)
      assert.deepEqual(
        await privateWindow.webContents.executeJavaScript(
          '({node:typeof require,desktop:typeof window.desktop,settings:typeof window.settings})',
        ),
        { node: 'undefined', desktop: 'undefined', settings: 'undefined' },
      )
      writeFileSync(
        preview.replace('.png', '-confirmation.png'),
        (await privateWindow.webContents.capturePage()).toPNG(),
      )
      const first = await privateWindow.webContents.executeJavaScript(
        'window.privateMode.getState()',
      )
      for (const command of [
        { kind: 'confirm', session: first.session, accepted: false },
        { kind: 'confirm', session: first.session, accepted: 'true' },
        { kind: 'confirm', session: first.session - 1, accepted: true },
        { kind: 'resume', session: first.session, file: '/tmp' },
      ])
        assert.equal(
          await privateWindow.webContents.executeJavaScript(
            `window.privateMode.command(${JSON.stringify(command)}).then(()=>false,()=>true)`,
          ),
          true,
        )
      assert.throws(
        () =>
          handlers.get('private:get')({
            sender: desktop.webContents,
            senderFrame: desktop.webContents.mainFrame,
          }),
        /Untrusted/,
      )
      assert.throws(
        () =>
          handlers.get('settings:private-open')({
            sender: desktop.webContents,
            senderFrame: desktop.webContents.mainFrame,
          }),
        /Untrusted/,
      )
      assert.throws(
        () =>
          handlers.get('private:command')(
            { sender: privateWindow.webContents, senderFrame: null },
            { kind: 'confirm', session: first.session, accepted: true },
          ),
        /Invalid/,
      )
      await exitButton(privateWindow, 'cancel')
      privateWindow = await open()
      assert.equal(
        await privateWindow.webContents.executeJavaScript(
          `window.privateMode.command({kind:'confirm',session:${first.session},accepted:true}).then(()=>false,()=>true)`,
        ),
        true,
        'stale confirmation rejected',
      )
      await enter(privateWindow)
      await waitFor(
        () => evaluate("window.__behavior.at(-1)?.status==='paused'"),
        'daily paused',
      )
      assert.equal(
        await evaluate("document.querySelector('#greeting').hidden"),
        true,
      )
      writeFileSync(
        preview,
        (await privateWindow.webContents.capturePage()).toPNG(),
      )
      await exitButton(privateWindow, 'return')
      await waitFor(() => desktop.isVisible(), 'daily restored')
      await waitFor(
        () => evaluate("window.__behavior.at(-1)?.status==='running'"),
        'daily running',
      )
      // Preserve an explicit pause and hidden state through entry/return.
      await openSettings()
      await ui('window.settings.update({paused:true})')
      await ui('window.settings.setVisible(false)')
      desktop.emit('show')
      assert.equal(
        (await ui('window.settings.getState()')).visible,
        false,
        'stale native show must not change hidden intent',
      )
      privateWindow = await openActive()
      await exitButton(privateWindow, 'return')
      assert.equal(desktop.isVisible(), false)
      assert.equal(
        (await ui('window.settings.getState()')).settings.paused,
        true,
      )
      await ui('window.settings.update({paused:false})')
      await ui('window.settings.setVisible(true)')
      desktop.emit('hide')
      assert.equal(
        (await ui('window.settings.getState()')).visible,
        true,
        'stale native hide must not change visible intent',
      )
      await setHide(true)
      privateWindow = await openActive()
      privateWindow.emit('blur')
      await waitFor(() => privateWindow.isDestroyed(), 'blur ON closes')
      assert.equal(desktop.isVisible(), false)
      menu.items.find((item) => item.label === '表示').click()
      assert.equal(
        BrowserWindow.getAllWindows().length,
        2,
        'tray only restores regular character',
      )
      await setHide(false)
      privateWindow = await openActive()
      privateWindow.emit('blur')
      await waitFor(
        () =>
          privateWindow.webContents.executeJavaScript(
            "document.body.dataset.paused==='true'",
          ),
        'blur OFF pauses',
      )
      assert.equal(privateWindow.isVisible(), true)
      privateWindow.emit('focus')
      assert.equal(
        await privateWindow.webContents.executeJavaScript(
          'document.body.dataset.paused',
        ),
        'true',
        'focus alone does not resume',
      )
      await privateWindow.webContents.executeJavaScript(
        "document.querySelector('#resume').click()",
      )
      await waitFor(
        () =>
          privateWindow.webContents.executeJavaScript(
            "document.body.dataset.paused==='false'",
          ),
        'explicit resume',
      )
      await exitButton(privateWindow, 'hide')
      assert.equal(desktop.isVisible(), false)
      menu.items.find((item) => item.label === '表示').click()
      for (const hide of [true, false]) {
        await setHide(hide)
        privateWindow = await openActive()
        powerMonitor.emit('suspend')
        await waitFor(
          () => privateWindow.isDestroyed(),
          'sleep closes either setting',
        )
        await waitFor(
          () => evaluate("window.__behavior.at(-1)?.status==='paused'"),
          'OS pause preserved',
        )
        powerMonitor.emit('resume')
        await waitFor(
          () => evaluate("window.__behavior.at(-1)?.status==='running'"),
          'OS resume regular',
        )
        assert.equal(BrowserWindow.getAllWindows().length, 2)
      }
      privateWindow = await openActive()
      privateWindow.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: 'Escape',
      })
      privateWindow.webContents.sendInputEvent({
        type: 'keyUp',
        keyCode: 'Escape',
      })
      await waitFor(() => privateWindow.isDestroyed(), 'Escape')
      privateWindow = await openActive()
      privateWindow.close()
      await waitFor(() => privateWindow.isDestroyed(), 'native close')
      privateWindow = await openActive()
      privateWindow.emit('minimize')
      await waitFor(() => privateWindow.isDestroyed(), 'minimize exits')
      menu.items.find((item) => item.label === '表示').click()
      await openSettings()
      await setHide(phase === 'corrupt')
      const memory = await evaluate('window.desktop.getMemory()')
      assert.equal(memory.affection, 0)
      assert.equal(memory.interactionCount, 0)
      privateWindow = await openActive()
      console.log('Private-mode process passed:', phase)
      // Quit from an active private session. Next process must ask for consent again.
      app.quit()
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})
require('../out/main/index.js')
