const assert = require('node:assert/strict')
const { readFileSync, writeFileSync } = require('node:fs')
const fsPromises = require('node:fs/promises')
const { join } = require('node:path')
const {
  app,
  BrowserWindow,
  Tray,
  ipcMain,
  dialog,
  powerMonitor,
} = require('electron')
const [directory, phase, preview] = process.argv.slice(2)
app.setPath('userData', directory)
let failSaves = false
const rename = fsPromises.rename
fsPromises.rename = async (...args) => {
  if (failSaves) throw Error('simulated event save failure')
  return rename(...args)
}
let menu, desktop
const handlers = new Map(),
  handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, listener) => {
  handlers.set(name, listener)
  return handle(name, listener)
}
const setMenu = Tray.prototype.setContextMenu
Tray.prototype.setContextMenu = function (value) {
  menu = value
  return setMenu.call(this, value)
}
let blockingErrors = 0
dialog.showErrorBox = () => {
  blockingErrors++
}
const timeout = setTimeout(() => {
  console.error('Event process timed out', phase)
  app.exit(1)
}, 45000)
app.on('quit', () => clearTimeout(timeout))
async function waitFor(condition, label = 'state') {
  for (let i = 0; i < 350; i++) {
    try {
      if (await condition()) return
    } catch {
      /* load/save/close boundary */
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw Error('Event state did not settle: ' + label)
}
app.on('browser-window-created', (_event, window) => {
  if (desktop) return
  desktop = window
  const daily = (expression) =>
    desktop.webContents.executeJavaScript(expression)
  desktop.webContents.once('dom-ready', () => {
    void daily(
      "window.__states=[];addEventListener('character-behavior',e=>__states.push(e.detail.snapshot.status))",
    )
  })
  desktop.webContents.once('did-finish-load', async () => {
    try {
      await waitFor(
        () => daily("document.body.dataset.lifecycleReady==='true'"),
        'startup',
      )
      assert.equal(
        BrowserWindow.getAllWindows().length,
        1,
        'never auto-open event at restart',
      )
      const open = async (fromSettings = false) => {
        if (fromSettings) {
          menu.items.find((item) => item.label === '設定…').click()
          const settings = BrowserWindow.getAllWindows().find(
            (w) => w.getTitle() === '小春の設定',
          )
          await waitFor(() => settings.isFocused(), 'settings focus')
          await waitFor(
            () =>
              settings.webContents.executeJavaScript(
                "!document.querySelector('#controls').disabled",
              ),
            'settings load',
          )
          await settings.webContents.executeJavaScript(
            "document.querySelector('#event-open').click()",
          )
        } else
          menu.items.find((item) => item.label === 'お話・イベント…').click()
        let candidate
        await waitFor(() => {
          candidate = BrowserWindow.getAllWindows().find(
            (w) => w !== desktop && w.getTitle() === 'お話・イベント',
          )
          return candidate?.isVisible()
        }, 'event window')
        await waitFor(
          () =>
            candidate.webContents.executeJavaScript(
              "document.querySelector('#events').dataset.phase==='list'",
            ),
          'event list',
        )
        candidate.focus()
        await waitFor(() => candidate.isFocused(), 'event focus')
        return candidate
      }
      let events = await open(phase === 'resume')
      const evaluate = (expression) =>
        events.webContents.executeJavaScript(expression)
      const view = () => evaluate('window.events.getView()')
      const command = async (kind, extra = {}) => {
        const state = await view()
        return evaluate(
          `window.events.command(${JSON.stringify({ kind, revision: state.revision, ...extra })})`,
        )
      }
      const node = (key) =>
        waitFor(
          () =>
            evaluate(
              `document.querySelector('#events').dataset.node===${JSON.stringify(key)}`,
            ),
          'node ' + key,
        )
      const click = async (id) => {
        await evaluate(`document.querySelector('#${id}').click()`)
      }
      const capture = async (path) => {
        await waitFor(
          () =>
            evaluate(
              "document.querySelector('#events').dataset.visualReady==='true'",
            ),
          'visual ready',
        )
        await evaluate(
          'Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))).then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))',
        )
        writeFileSync(path, (await events.webContents.capturePage()).toPNG())
      }
      const start = async (resume = false) => {
        await evaluate(
          `document.querySelector('button[data-event="tea-sample"][data-resume="${resume}"]').click()`,
        )
        await waitFor(
          () =>
            evaluate(
              "document.querySelector('#events').dataset.phase==='playing'",
            ),
          'playing',
        )
      }
      const prefs = events.webContents.getLastWebPreferences()
      assert.equal(prefs.nodeIntegration, false)
      assert.equal(prefs.contextIsolation, true)
      assert.equal(prefs.sandbox, true)
      assert.deepEqual(
        await evaluate(
          '({node:typeof require,desktop:typeof window.desktop,settings:typeof window.settings,privateMode:typeof window.privateMode})',
        ),
        {
          node: 'undefined',
          desktop: 'undefined',
          settings: 'undefined',
          privateMode: 'undefined',
        },
      )
      assert.equal(await daily('typeof window.events'), 'undefined')
      assert.throws(
        () =>
          handlers.get('events:get')({
            sender: desktop.webContents,
            senderFrame: desktop.webContents.mainFrame,
          }),
        /Untrusted/,
      )
      assert.throws(
        () =>
          handlers.get('events:command')(
            { sender: events.webContents, senderFrame: null },
            {
              kind: 'start',
              revision: 0,
              eventId: 'tea-sample',
              resume: false,
            },
          ),
        /Invalid/,
      )
      const before = await view()
      for (const eventId of ['tea-locked', 'private-test', 'missing']) {
        assert.equal(
          await evaluate(
            `window.events.command(${JSON.stringify({ kind: 'start', revision: before.revision, eventId, resume: false })}).then(()=>false,()=>true)`,
          ),
          true,
        )
        assert.deepEqual(await view(), before)
      }
      assert.equal(
        desktop.isVisible(),
        true,
        'locked starts leave the day untouched',
      )
      assert.equal(
        await evaluate(
          "document.querySelector('button[data-event=" +
            '"tea-locked"' +
            "]').disabled",
        ),
        true,
      )
      await start(phase === 'resume')
      await waitFor(() => !desktop.isVisible(), 'daily hidden')
      assert.equal(
        (await daily('window.desktop.getPresentation()')).eventPaused,
        true,
      )
      await waitFor(() => daily("__states.at(-1)==='paused'"), 'daily paused')
      if (phase === 'resume') {
        await node('book')
        assert.equal((await view()).frame.cgAssetId, 'missing-card')
        await waitFor(
          () =>
            evaluate("!document.querySelector('#event-image-fallback').hidden"),
          'fallback',
        )
        await click('event-next')
        await node('end')
        await click('event-next')
        await waitFor(() => events.isDestroyed(), 'finish returns')
        await waitFor(() => desktop.isVisible(), 'day restored')
        await waitFor(() => daily("__states.at(-1)==='running'"), 'day resumed')
        events = await open()
        assert.equal(
          (await view()).events.find((e) => e.id === 'tea-sample').completed,
          true,
        )
        await start(false)
        await node('hello')
        await click('event-next')
        await node('choose')
        await evaluate(
          "document.querySelector('button[data-choice=" +
            '"tea"' +
            "]').click()",
        )
        await node('tea')
        await waitFor(
          () =>
            evaluate(
              "!document.querySelector('#event-cg').hidden && document.querySelector('#event-cg').complete",
            ),
          'CG',
        )
        await capture(preview)
        events.setSize(640, 480)
        await waitFor(() => evaluate('innerWidth<=640'), 'small window')
        assert.equal(
          await evaluate('document.documentElement.scrollWidth<=innerWidth'),
          true,
        )
        assert.equal(
          await evaluate(
            "getComputedStyle(document.querySelector('#event-text')).fontSize",
          ),
          '18px',
        )
        await capture(preview.replace('.png', '-small.png'))
        await click('event-next')
        await node('end')
        await click('event-next')
        await waitFor(() => events.isDestroyed(), 'second completion')
        menu.items.find((item) => item.label === '設定…').click()
        const settings = BrowserWindow.getAllWindows().find(
          (w) => w.getTitle() === '小春の設定',
        )
        await waitFor(() => settings.isFocused(), 'settings focus for pause')
        await settings.webContents.executeJavaScript(
          'window.settings.update({paused:true})',
        )
        await settings.webContents.executeJavaScript(
          'window.settings.setVisible(false)',
        )
        events = await open(true)
        await start(false)
        await node('hello')
        await click('event-next')
        await node('choose')
        await evaluate(
          `document.querySelector('button[data-choice="tea"]').click()`,
        )
        await node('tea')
        await click('event-next')
        await node('end')
        await click('event-next')
        await waitFor(
          () => events.isDestroyed(),
          'completion preserves prior hidden pause',
        )
        assert.equal(desktop.isVisible(), false)
        const restored = await daily('window.desktop.getPresentation()')
        assert.equal(restored.eventPaused, false)
        assert.equal(restored.settings.paused, true)
        app.quit()
      } else if (phase === 'interrupt') {
        await node('hello')
        await capture(preview.replace('.png', '-sprite.png'))
        assert.equal(
          await evaluate(
            `(() => { const canvas=document.querySelector('#event-character canvas'); const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data; return pixels.some((value,index)=>index%4===3 && value>0) })()`,
          ),
          true,
          'standing PNG is really painted',
        )
        const revision = (await view()).revision
        await click('event-next')
        await node('choose')
        await capture(preview.replace('.png', '-choices.png'))
        assert.equal(
          await evaluate(
            `window.events.command({kind:'advance',revision:${revision}}).then(()=>false,()=>true)`,
          ),
          true,
          'duplicate next rejected',
        )
        assert.equal(
          await evaluate("document.querySelector('#event-next').disabled"),
          true,
          'choice waits',
        )
        events.emit('blur')
        await waitFor(async () => (await view()).paused, 'blur pause')
        assert.equal(
          await evaluate(
            `window.events.command({kind:'choose',revision:${(await view()).revision},choiceId:'book'}).then(()=>false,()=>true)`,
          ),
          true,
        )
        events.emit('focus')
        assert.equal((await view()).paused, true)
        await click('event-resume')
        await waitFor(async () => !(await view()).paused, 'explicit resume')
        await evaluate(
          "document.querySelector('button[data-choice=" +
            '"book"' +
            "]').click()",
        )
        await node('book')
        assert.equal(
          await evaluate(
            "document.querySelector('#event-image-fallback').hidden",
          ),
          false,
        )
        await capture(preview.replace('.png', '-missing.png'))
        await waitFor(
          () =>
            JSON.parse(readFileSync(join(directory, 'memory.json'), 'utf8'))
              .events['tea-sample'].node === 'book',
          'checkpoint on disk',
        )
        // A stale close must still work and must not be gated on persistence.
        await evaluate(
          `window.events.command({kind:'hide',revision:${revision}})`,
        ).catch(() => {})
        await waitFor(() => events.isDestroyed(), 'hide')
        assert.equal(desktop.isVisible(), false)
        menu.items.find((item) => item.label === '表示').click()
        events = await open()
        assert.equal((await view()).phase, 'list')
        assert.equal((await view()).frame, null)
        await start(true)
        await node('book')
        powerMonitor.emit('suspend')
        await waitFor(() => events.isDestroyed(), 'sleep closes event')
        powerMonitor.emit('resume')
        assert.equal(
          BrowserWindow.getAllWindows().filter(
            (w) => w.getTitle() === 'お話・イベント',
          ).length,
          0,
        )
        app.quit()
      } else {
        await node('hello')
        await waitFor(
          () =>
            JSON.parse(readFileSync(join(directory, 'memory.json'), 'utf8'))
              .events['tea-sample'].node === 'hello',
          'last good checkpoint',
        )
        failSaves = true
        await click('event-next')
        await node('choose')
        await waitFor(
          async () => (await view()).saveFailed,
          'save error reported',
        )
        assert.equal(
          blockingErrors,
          0,
          'save failures do not open blocking dialogs',
        )
        await command('return').catch(() => {})
        await waitFor(() => events.isDestroyed(), 'return after save failure')
        assert.equal(desktop.isVisible(), true)
        app.quit()
      }
      console.log('Event process passed:', phase)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})
require('../out/main/index.js')
