import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  ipcMain,
  nativeImage,
  screen,
  powerMonitor,
  dialog,
} from 'electron'
import type { IpcMainEvent, MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import trayIconPath from '../../resources/tray.png?asset'
import { channels, type LaunchInfo } from '../shared/desktop-api'
import { fitToWorkArea, initialBounds, scaledBounds } from './window-bounds'
import { createSettingsWindow } from './settings-window'
import {
  validateSettingsPatch,
  type PresentationState,
} from '../shared/presentation'
import type { MemorySession } from './memory-session'
import { actions } from '../shared/character-state'

export function createDesktopWindow(
  launchInfo: LaunchInfo,
  memory: () => MemorySession,
  persist: () => void,
  resetMemory: () => Promise<void>,
): {
  window: BrowserWindow
  show: () => void
} {
  const saved = memory().snapshot().settings
  const initial =
    saved.windowBounds ??
    initialBounds(screen.getPrimaryDisplay().workArea, saved.scale)
  const window = new BrowserWindow({
    ...fitToWorkArea(initial, screen.getDisplayMatching(initial).workArea),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: saved.alwaysOnTop,
    acceptFirstMouse: true,
    show: false,
    title: 'AI Desktop Kanojo',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  const supportsForwarding =
    process.platform === 'win32' || process.platform === 'darwin'
  let clickThrough = supportsForwarding && saved.clickThrough
  let interactive = false
  let quitting = false
  let shown = false
  let currentLaunchInfo = launchInfo
  let interactionEligible = false
  let resetPending = false
  let settingsWindow: BrowserWindow | undefined
  let revision = 0
  function presentation(): PresentationState {
    return { revision, visible: shown, settings: memory().snapshot().settings }
  }
  function publish(): void {
    revision++
    const state = presentation()
    if (!window.webContents.isDestroyed())
      window.webContents.send(channels.presentation, state)
    if (settingsWindow && !settingsWindow.isDestroyed())
      settingsWindow.webContents.send(channels.settingsChanged, state)
  }
  function openSettings(): void {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show()
      settingsWindow.focus()
      return
    }
    const created = createSettingsWindow()
    settingsWindow = created
    created.on('closed', () => {
      if (settingsWindow === created) settingsWindow = undefined
    })
  }
  function applySettings(value: unknown): PresentationState {
    const patch = validateSettingsPatch(value)
    const previous = memory().snapshot().settings
    const next = { ...previous, ...patch }
    if (!supportsForwarding) next.clickThrough = false
    memory().settings(next)
    window.setAlwaysOnTop(next.alwaysOnTop)
    clickThrough = next.clickThrough
    if (next.scale !== previous.scale) {
      stopDrag()
      const bounds = window.getBounds()
      window.setBounds(
        scaledBounds(
          bounds,
          screen.getDisplayMatching(bounds).workArea,
          next.scale,
        ),
      )
    }
    if (next.paused) interactionEligible = false
    rememberWindow()
    updateMouse()
    refreshTray()
    return presentation()
  }
  function rememberWindow(): void {
    if (quitting) return
    const settings = memory().snapshot().settings
    const bounds = window.getBounds()
    // Tiny OS work areas can temporarily shrink below save-schema bounds.
    if (bounds.width >= 80 && bounds.height >= 80)
      settings.windowBounds = bounds
    settings.alwaysOnTop = window.isAlwaysOnTop()
    settings.clickThrough = clickThrough
    memory().settings(settings)
    persist()
    publish()
  }
  let drag:
    | {
        cursor: Electron.Point
        origin: Electron.Rectangle
        started: number
        moved: boolean
      }
    | undefined
  let dragTimer: ReturnType<typeof setInterval> | undefined

  function updateMouse(): void {
    window.setIgnoreMouseEvents(clickThrough && !interactive && !drag, {
      forward: true,
    })
  }

  function stopDrag(): void {
    if (dragTimer) clearInterval(dragTimer)
    dragTimer = undefined
    drag = undefined
    updateMouse()
  }

  function keepOnScreen(): void {
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    const fitted = fitToWorkArea(bounds, area)
    if (
      Object.keys(fitted).some(
        (key) =>
          fitted[key as keyof typeof fitted] !==
          bounds[key as keyof typeof fitted],
      )
    ) {
      window.setBounds(fitted)
    }
  }

  function show(): void {
    stopDrag()
    interactive = false
    keepOnScreen()
    updateMouse()
    shown = true
    window.showInactive()
    refreshTray()
    publish()
  }

  function hide(): void {
    stopDrag()
    shown = false
    window.hide()
    refreshTray()
    publish()
  }

  function menuItems(): MenuItemConstructorOptions[] {
    return [
      { label: '設定…', click: openSettings },
      { label: '表示', enabled: !shown, click: show },
      { label: '非表示', enabled: shown, click: hide },
      { type: 'separator' },
      {
        label: '常に手前に表示',
        type: 'checkbox',
        checked: window.isAlwaysOnTop(),
        click: (item) => {
          applySettings({ alwaysOnTop: item.checked })
        },
      },
      {
        label: '透明領域をクリック透過（試験機能）',
        type: 'checkbox',
        checked: clickThrough,
        enabled: supportsForwarding,
        click: (item) => {
          applySettings({ clickThrough: item.checked })
        },
      },
      {
        label: '動きとセリフを一時停止',
        type: 'checkbox',
        checked: memory().snapshot().settings.paused,
        click: (item) => {
          applySettings({ paused: item.checked })
        },
      },
      {
        label: '主画面の右下に戻す',
        click: () => {
          stopDrag()
          window.setBounds(
            initialBounds(
              screen.getPrimaryDisplay().workArea,
              memory().snapshot().settings.scale,
            ),
          )
          show()
        },
      },
      {
        label: '開発者ツール',
        click: () => window.webContents.openDevTools({ mode: 'detach' }),
      },
      {
        label: '生活記憶・設定を初期化…',
        click: async () => {
          if (resetPending) return
          resetPending = true
          try {
            const answer = await dialog.showMessageBox(window, {
              type: 'warning',
              title: '生活記憶を初期化',
              message: '親密度・交流回数・利用時間・設定を消去しますか？',
              detail: 'この操作は取り消せません。小春の画像は削除しません。',
              buttons: ['キャンセル', '初期化する'],
              defaultId: 0,
              cancelId: 0,
            })
            if (answer.response !== 1) return
            stopDrag()
            interactionEligible = false
            await resetMemory()
            currentLaunchInfo = { firstLaunch: true }
            clickThrough = supportsForwarding
            window.setAlwaysOnTop(true)
            window.setBounds(initialBounds(screen.getPrimaryDisplay().workArea))
            rememberWindow()
            publish()
            window.webContents.reload()
            show()
          } catch (error) {
            console.error('Memory reset failed', error)
            dialog.showErrorBox(
              '初期化できませんでした',
              '保存先へのアクセスを確認してください。',
            )
          } finally {
            resetPending = false
          }
        },
      },
      { type: 'separator' },
      { label: '終了', click: () => app.quit() },
    ]
  }

  const image = nativeImage
    .createFromPath(trayIconPath)
    .resize({ width: 20, height: 20 })
  const tray = new Tray(image)
  tray.setToolTip('AI Desktop Kanojo — 右クリックで操作')
  function refreshTray(): void {
    tray.setContextMenu(Menu.buildFromTemplate(menuItems()))
  }
  refreshTray()
  tray.on('double-click', show)
  window.on('show', () => {
    shown = true
    keepOnScreen()
    refreshTray()
    publish()
  })
  window.on('hide', () => {
    shown = false
    refreshTray()
    publish()
  })

  const trusted = (
    event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>,
  ): boolean =>
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame
  const trustedSettings = (
    event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>,
  ): boolean =>
    !!settingsWindow &&
    !settingsWindow.isDestroyed() &&
    event.sender === settingsWindow.webContents &&
    event.senderFrame === settingsWindow.webContents.mainFrame
  ipcMain.handle(channels.presentation, (event) => {
    if (!trusted(event)) throw new Error('Untrusted presentation request')
    return presentation()
  })
  ipcMain.handle(channels.settingsGet, (event) => {
    if (!trustedSettings(event)) throw new Error('Untrusted settings request')
    return presentation()
  })
  ipcMain.handle(channels.settingsUpdate, (event, patch: unknown) => {
    if (!trustedSettings(event) || quitting || resetPending)
      throw new Error('Settings unavailable')
    return applySettings(patch)
  })
  ipcMain.handle(channels.settingsVisible, (event, visible: unknown) => {
    if (
      !trustedSettings(event) ||
      typeof visible !== 'boolean' ||
      quitting ||
      resetPending
    )
      throw new Error('Invalid visibility request')
    if (visible) show()
    else hide()
    return presentation()
  })

  const pointerHandler = (event: IpcMainEvent, value: unknown): void => {
    if (!trusted(event) || typeof value !== 'boolean') return
    interactive = value
    updateMouse()
  }
  const dragHandler = (event: IpcMainEvent, value: unknown): void => {
    if (!trusted(event) || typeof value !== 'boolean') return
    if (!value) {
      stopDrag()
      return
    }
    if (drag || !window.isVisible()) return
    interactionEligible = false
    drag = {
      cursor: screen.getCursorScreenPoint(),
      origin: window.getBounds(),
      started: performance.now(),
      moved: false,
    }
    updateMouse()
    // Poll only during a deliberate drag; use DIP coordinates from Main, never renderer screenX.
    dragTimer = setInterval(sampleDrag, 16)
  }
  function sampleDrag(): void {
    if (!drag) return
    if (performance.now() - drag.started > 30000) {
      stopDrag()
      return
    }
    const cursor = screen.getCursorScreenPoint()
    const dx = cursor.x - drag.cursor.x
    const dy = cursor.y - drag.cursor.y
    if (!drag.moved && Math.hypot(dx, dy) < 6) return
    drag.moved = true
    const area = screen.getDisplayNearestPoint(cursor).workArea
    window.setBounds(
      fitToWorkArea(
        { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy },
        area,
      ),
    )
  }
  ipcMain.handle(channels.dragEnd, (event) => {
    if (!trusted(event)) throw new Error('Untrusted drag-end request')
    sampleDrag()
    const result = !drag ? 'cancelled' : drag.moved ? 'drag' : 'click'
    interactionEligible = result === 'click'
    stopDrag()
    return result
  })

  const openMenu = (): void => {
    stopDrag()
    Menu.buildFromTemplate(menuItems()).popup({ window })
  }
  const menuHandler = (event: IpcMainEvent): void => {
    if (trusted(event)) openMenu()
  }
  ipcMain.handle(channels.launch, (event) => {
    if (!trusted(event)) throw new Error('Untrusted launch-info request')
    return currentLaunchInfo
  })
  ipcMain.handle(channels.memory, (event) => {
    if (!trusted(event)) throw new Error('Untrusted memory request')
    return memory().snapshot()
  })
  ipcMain.handle(channels.interaction, (event) => {
    if (!trusted(event)) throw new Error('Untrusted interaction request')
    if (
      interactionEligible &&
      window.isVisible() &&
      !resetPending &&
      !quitting &&
      !memory().snapshot().settings.paused
    ) {
      interactionEligible = false
      const state = memory().interact()
      persist()
      return state
    }
    return memory().snapshot()
  })
  const actionHandler = (event: IpcMainEvent, value: unknown): void => {
    if (
      resetPending ||
      quitting ||
      !trusted(event) ||
      !actions.some((action) => action === value)
    )
      return
    memory().action(value as (typeof actions)[number])
    persist()
  }
  ipcMain.on(channels.action, actionHandler)
  const suspend = (): void => {
    interactionEligible = false
    memory().power(true)
    persist()
    if (!window.webContents.isDestroyed())
      window.webContents.send(channels.power, 'suspend')
  }
  const resume = (): void => {
    memory().power(false)
    if (!window.webContents.isDestroyed())
      window.webContents.send(channels.power, 'resume')
  }
  powerMonitor.on('suspend', suspend)
  powerMonitor.on('resume', resume)
  ipcMain.on(channels.pointer, pointerHandler)
  ipcMain.on(channels.drag, dragHandler)
  ipcMain.on(channels.menu, menuHandler)
  window.webContents.on('context-menu', openMenu)
  window.on('blur', stopDrag)
  window.on('move', rememberWindow)
  window.on('resize', rememberWindow)
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      hide()
    }
  })
  const beforeQuit = (): void => {
    quitting = true
    stopDrag()
  }
  app.on('before-quit', beforeQuit)
  screen.on('display-removed', keepOnScreen)
  screen.on('display-added', keepOnScreen)
  screen.on('display-metrics-changed', keepOnScreen)
  window.on('closed', () => {
    if (dragTimer) clearInterval(dragTimer)
    tray.destroy()
    settingsWindow?.destroy()
    for (const channel of [
      channels.presentation,
      channels.settingsGet,
      channels.settingsUpdate,
      channels.settingsVisible,
    ])
      ipcMain.removeHandler(channel)
    ipcMain.removeHandler(channels.launch)
    ipcMain.removeHandler(channels.dragEnd)
    ipcMain.removeHandler(channels.memory)
    ipcMain.removeHandler(channels.interaction)
    ipcMain.removeListener(channels.action, actionHandler)
    powerMonitor.removeListener('suspend', suspend)
    powerMonitor.removeListener('resume', resume)
    ipcMain.removeListener(channels.pointer, pointerHandler)
    ipcMain.removeListener(channels.drag, dragHandler)
    ipcMain.removeListener(channels.menu, menuHandler)
    app.removeListener('before-quit', beforeQuit)
    screen.removeListener('display-removed', keepOnScreen)
    screen.removeListener('display-added', keepOnScreen)
    screen.removeListener('display-metrics-changed', keepOnScreen)
  })
  window.webContents.on('did-start-loading', () => {
    interactionEligible = false
    interactive = false
    stopDrag()
  })
  window.once('ready-to-show', () => {
    if (memory().snapshot().settings.showOnStartup) show()
    else hide()
  })
  updateMouse()
  return { window, show }
}
