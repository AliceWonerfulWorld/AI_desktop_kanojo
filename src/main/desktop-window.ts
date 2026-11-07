import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  ipcMain,
  nativeImage,
  screen,
  powerMonitor,
} from 'electron'
import type { IpcMainEvent, MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import trayIconPath from '../../resources/tray.png?asset'
import { channels, type LaunchInfo } from '../shared/desktop-api'
import { fitToWorkArea, initialBounds } from './window-bounds'

export function createDesktopWindow(launchInfo: LaunchInfo): {
  window: BrowserWindow
  show: () => void
} {
  const window = new BrowserWindow({
    ...initialBounds(screen.getPrimaryDisplay().workArea),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
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
  let clickThrough = supportsForwarding
  let interactive = false
  let quitting = false
  let shown = false
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
  }

  function hide(): void {
    stopDrag()
    shown = false
    window.hide()
    refreshTray()
  }

  function menuItems(): MenuItemConstructorOptions[] {
    return [
      { label: '表示', enabled: !shown, click: show },
      { label: '非表示', enabled: shown, click: hide },
      { type: 'separator' },
      {
        label: '常に手前に表示',
        type: 'checkbox',
        checked: window.isAlwaysOnTop(),
        click: (item) => {
          window.setAlwaysOnTop(item.checked)
          refreshTray()
        },
      },
      {
        label: '透明領域をクリック透過（試験機能）',
        type: 'checkbox',
        checked: clickThrough,
        enabled: supportsForwarding,
        click: (item) => {
          clickThrough = item.checked
          updateMouse()
          refreshTray()
        },
      },
      {
        label: '主画面の右下に戻す',
        click: () => {
          stopDrag()
          window.setBounds(initialBounds(screen.getPrimaryDisplay().workArea))
          show()
        },
      },
      {
        label: '開発者ツール',
        click: () => window.webContents.openDevTools({ mode: 'detach' }),
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
  })
  window.on('hide', () => {
    shown = false
    refreshTray()
  })

  const trusted = (
    event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>,
  ): boolean =>
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame

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
    drag = {
      cursor: screen.getCursorScreenPoint(),
      origin: window.getBounds(),
      started: Date.now(),
      moved: false,
    }
    updateMouse()
    // Poll only during a deliberate drag; use DIP coordinates from Main, never renderer screenX.
    dragTimer = setInterval(() => {
      if (!drag) return
      if (Date.now() - drag.started > 30000) {
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
    }, 16)
  }
  const openMenu = (): void => {
    stopDrag()
    Menu.buildFromTemplate(menuItems()).popup({ window })
  }
  const menuHandler = (event: IpcMainEvent): void => {
    if (trusted(event)) openMenu()
  }
  ipcMain.handle(channels.launch, (event) => {
    if (!trusted(event)) throw new Error('Untrusted launch-info request')
    return launchInfo
  })
  const suspend = (): void => {
    if (!window.webContents.isDestroyed())
      window.webContents.send(channels.power, 'suspend')
  }
  const resume = (): void => {
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
    ipcMain.removeHandler(channels.launch)
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
    interactive = false
    stopDrag()
  })
  window.once('ready-to-show', show)
  updateMouse()
  return { window, show }
}
