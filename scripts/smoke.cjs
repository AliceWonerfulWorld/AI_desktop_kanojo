const assert = require('node:assert/strict')
const { once } = require('node:events')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { app, Tray, Menu, screen, ipcMain, powerMonitor } = require('electron')

const testUserData = mkdtempSync(join(tmpdir(), 'kanojo-smoke-'))
app.setPath('userData', testUserData)
app.on('quit', () => {
  try {
    rmSync(testUserData, { recursive: true, force: true })
  } catch (error) {
    console.warn('Temporary userData cleanup deferred:', error.code)
  }
})

async function waitFor(condition) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.ok(await condition(), 'Window/renderer condition did not settle')
}

// getLaunchInfo resolves before initialize() displays its short-lived greeting.
// Observe the real DOM before releasing that IPC response, rather than sampling
// text that may already have expired on a busy runner. This hook is test-only.
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => {
  if (channel !== 'desktop:launch') return handle(channel, listener)
  return handle(channel, async (event, ...args) => {
    await event.sender.executeJavaScript(`(() => {
      if (window.__startupGreeting) return;
      const bubble = document.querySelector('#greeting');
      window.__startupGreeting = { text: '' };
      const observer = new MutationObserver(() => {
        if (!bubble.hidden && bubble.textContent) {
          window.__startupGreeting.text = bubble.textContent;
          observer.disconnect();
        }
      });
      observer.observe(bubble, {childList:true,subtree:true,characterData:true,attributes:true});
    })()`)
    return listener(event, ...args)
  })
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

let popups = 0
const buildMenu = Menu.buildFromTemplate
Menu.buildFromTemplate = (...args) => {
  const built = buildMenu(...args)
  built.popup = () => {
    popups++
  }
  return built
}
let dragMessages = 0
ipcMain.on('desktop:drag', () => {
  dragMessages++
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
app.once('quit', () => clearTimeout(timeout))

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
      await waitFor(() =>
        window.webContents.executeJavaScript(
          "document.querySelector('#character').dataset.ready === 'true' && document.body.dataset.lifecycleReady === 'true'",
        ),
      )
      await waitFor(() =>
        window.webContents.executeJavaScript(
          '!!window.__startupGreeting?.text',
        ),
      )
      // Regression case: read the startup evidence after the five-second bubble
      // has expired, without extending or replacing the production timer.
      if (process.argv.includes('--slow-startup-check'))
        await new Promise((resolve) => setTimeout(resolve, 5500))
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
        hasCanvas: !!document.querySelector('#character canvas'),
        previewType: typeof window.characterPreview,
        behaviorPreviewType: typeof window.behaviorPreview,
        timePreviewType: typeof window.timePreview,
        relationshipPreviewType: typeof window.relationshipPreview,
        greeting: window.__startupGreeting.text,
        greetingHidden: document.querySelector('#greeting').hidden,
        currentGreeting: document.querySelector('#greeting').textContent,
        greetingPointerEvents: getComputedStyle(document.querySelector('#greeting')).pointerEvents,
        autonomousAction: document.querySelector('#character').dataset.action
      })`)
      assert.match(state.status, /接続を確認しました/)
      assert.match(state.status, /素材: koharu-/)
      assert.equal(state.electron, process.versions.electron)
      assert.equal(state.requireType, 'undefined')
      assert.equal(state.processType, 'undefined')
      assert.equal(state.background, 'rgba(0, 0, 0, 0)')
      assert.equal(state.hasCanvas, true)
      assert.equal(
        state.previewType,
        'undefined',
        'development preview must not exist in production',
      )

      assert.equal(state.behaviorPreviewType, 'undefined')
      assert.ok(
        ['idle', 'reading', 'resting', 'sleeping'].includes(
          state.autonomousAction,
        ),
      )
      assert.equal(state.timePreviewType, 'undefined')
      assert.equal(state.relationshipPreviewType, 'undefined')
      assert.match(state.greeting, /はじめまして/)
      if (process.argv.includes('--slow-startup-check')) {
        assert.equal(
          state.currentGreeting,
          '',
          'expired greeting must be cleared',
        )
        assert.equal(
          state.greetingHidden,
          true,
          'expired greeting must stay hidden',
        )
      }
      assert.equal(state.greetingPointerEvents, 'none')
      assert.deepEqual(
        await window.webContents.executeJavaScript(
          'window.desktop.getLaunchInfo()',
        ),
        { firstLaunch: true },
      )

      await window.webContents.executeJavaScript(`{
        window.__powerSnapshots = [];
        addEventListener('character-behavior', event => window.__powerSnapshots.push(event.detail.snapshot));
      }`)
      powerMonitor.emit('suspend')
      powerMonitor.emit('suspend')
      await waitFor(() =>
        window.webContents.executeJavaScript(
          "window.__powerSnapshots.at(-1)?.status === 'paused'",
        ),
      )
      powerMonitor.emit('resume')
      powerMonitor.emit('resume')
      await waitFor(() =>
        window.webContents.executeJavaScript(
          "window.__powerSnapshots.at(-1)?.status === 'running'",
        ),
      )
      const powerStates = await window.webContents.executeJavaScript(
        'window.__powerSnapshots.map(snapshot => snapshot.status)',
      )
      assert.deepEqual(powerStates, ['paused', 'running'])
      await window.webContents.executeJavaScript(`{
        window.__removedPowerCallbacks = 0;
        const remove = window.desktop.onPowerState(() => window.__removedPowerCallbacks++);
        remove();
      }`)
      window.webContents.send('desktop:power', 'invalid')
      assert.equal(
        await window.webContents.executeJavaScript(
          'window.__removedPowerCallbacks',
        ),
        0,
      )

      const ipc = async (channel, expression) => {
        const delivered = once(ipcMain, channel)
        await window.webContents.executeJavaScript(expression)
        await delivered
      }
      const forwarding =
        process.platform === 'win32' || process.platform === 'darwin'
      const moveTo = async (x, y) =>
        ipc(
          'desktop:pointer',
          `document.dispatchEvent(new MouseEvent('mousemove', {clientX:${x},clientY:${y},bubbles:true}))`,
        )
      await moveTo(10, 10)
      assert.equal(
        ignoringMouse,
        forwarding,
        'transparent image margins pass through',
      )
      await moveTo(170, 346)
      assert.equal(ignoringMouse, false, 'opaque PNG pixels take input')
      await moveTo(170, 544)
      assert.equal(
        ignoringMouse,
        forwarding,
        'transparent gap inside PNG rectangle passes through',
      )
      await moveTo(146, 544)
      assert.equal(
        ignoringMouse,
        false,
        'return from transparent gap restores input',
      )
      await ipc(
        'desktop:pointer',
        'window.desktop.setPointerInteractive("invalid")',
      )
      assert.equal(ignoringMouse, false, 'invalid payload must be ignored')
      const dragsBefore = dragMessages
      const menusBefore = popups
      await window.webContents.executeJavaScript(`{
        const character = document.querySelector('#character');
        character.dispatchEvent(new PointerEvent('pointerdown', {button:0,clientX:170,clientY:544,bubbles:true}));
        character.dispatchEvent(new MouseEvent('contextmenu', {clientX:170,clientY:544,bubbles:true,cancelable:true}));
      }`)
      await new Promise((resolve) => setTimeout(resolve, 50))
      assert.equal(
        dragMessages,
        dragsBefore,
        'transparent PNG pixels must never begin a drag',
      )
      assert.equal(
        popups,
        menusBefore,
        'transparent PNG pixels must never open a character menu',
      )
      await ipc(
        'desktop:menu',
        `document.querySelector('#character').dispatchEvent(new MouseEvent('contextmenu', {clientX:170,clientY:346,bubbles:true,cancelable:true}))`,
      )
      assert.equal(
        popups,
        menusBefore + 1,
        'opaque PNG pixels keep the context menu',
      )

      // Exercise the real Renderer pointer handlers before any click cooldown can mask a drag.
      await window.webContents.executeJavaScript(`{
        window.__interactions = [];
        addEventListener('character-interaction', event => window.__interactions.push(event.detail));
      }`)
      window.show()
      window.focus()
      window.webContents.focus()
      await waitFor(() => window.isFocused())
      const nativeCursor = screen.getCursorScreenPoint
      const inputOrigin = window.getBounds()
      let inputCursor = { x: inputOrigin.x + 170, y: inputOrigin.y + 346 }
      screen.getCursorScreenPoint = () => inputCursor
      const pauseInput = () => new Promise((resolve) => setTimeout(resolve, 60))
      const mouse = (type, x, y, button = 'left') =>
        window.webContents.sendInputEvent({ type, x, y, button, clickCount: 1 })
      const countInteractions = () =>
        window.webContents.executeJavaScript('window.__interactions.length')
      const settleInput = () =>
        window.webContents.executeJavaScript(`new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
      const press = async (x, y, button = 'left', expectDrag = false) => {
        window.setIgnoreMouseEvents(false)
        mouse('mouseMove', x, y, button)
        // Flush pointer capture changes and movement before the next press.
        await settleInput()
        const before = dragMessages
        mouse('mouseDown', x, y, button)
        if (expectDrag) await waitFor(() => dragMessages > before)
        else await pauseInput()
      }
      await press(10, 10)
      mouse('mouseUp', 10, 10)
      await pauseInput()
      assert.equal(
        await countInteractions(),
        0,
        'transparent pixels do not interact',
      )
      await press(170, 346, 'left', true)
      inputCursor = { x: inputCursor.x + 30, y: inputCursor.y + 20 }
      mouse('mouseMove', 200, 366)
      mouse('mouseUp', 200, 366)
      await pauseInput()
      assert.equal(
        await countInteractions(),
        0,
        'drag release does not interact',
      )
      await press(170, 346, 'left', true)
      await window.webContents.executeJavaScript(
        "dispatchEvent(new Event('blur'))",
      )
      mouse('mouseUp', 170, 346)
      await pauseInput()
      assert.equal(
        await countInteractions(),
        0,
        'cancelled pointer does not interact',
      )
      await press(170, 346, 'right')
      mouse('mouseUp', 170, 346, 'right')
      await pauseInput()
      assert.equal(await countInteractions(), 0, 'right click is menu-only')
      await press(170, 346, 'left', true)
      mouse('mouseUp', 170, 346)
      await waitFor(async () => (await countInteractions()) === 1)
      // The interaction notification precedes async PNG decoding. Wait for its
      // actual frame before sending more native input (including capture changes).
      await waitFor(() =>
        window.webContents.executeJavaScript(`{
        const reaction = window.__interactions[0];
        document.querySelector('#status').textContent.includes(
          '状態: ' + reaction.action + '/' + reaction.expression)
      }`),
      )
      await settleInput()
      for (let i = 0; i < 3; i++) {
        await press(170, 346, 'left', true)
        mouse('mouseUp', 170, 346)
        await pauseInput()
      }
      assert.equal(
        await countInteractions(),
        1,
        'rapid clicks do not multiply reactions',
      )
      assert.ok(
        (
          await window.webContents.executeJavaScript(
            "document.querySelector('#greeting').textContent",
          )
        ).length > 0,
      )
      screen.getCursorScreenPoint = nativeCursor
      window.setBounds(inputOrigin)

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
      await ipc('desktop:drag', 'window.desktop.setDragging(true)')
      cursor = { x: cursor.x + 20, y: cursor.y }
      assert.equal(
        await window.webContents.executeJavaScript(
          'window.desktop.finishDrag()',
        ),
        'drag',
      )
      assert.equal(
        await window.webContents.executeJavaScript(
          'window.desktop.finishDrag()',
        ),
        'cancelled',
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
      // Exercise the real Quit path, including native tray and window cleanup.
      item('終了').click()
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  })
})

require('../out/main/index.js')
