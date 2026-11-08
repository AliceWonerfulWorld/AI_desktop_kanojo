import { characterRegistry } from '../shared/outfit-registry'
import { isOutfitId, type OutfitId } from '../shared/outfits'
import { EventPlayer, isEventCommand } from '../events/event-player'
import { eventCatalog } from '../events/catalog'
import { createEventWindow } from './event-window'
import type { Audience } from '../events/event-schema'
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
import { createPrivateModeWindow } from './private-mode-window'
import {
  PrivateModeSession,
  isPrivateModeCommand,
} from '../shared/private-mode'
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
  saveCheckpoint: () => Promise<void>,
): {
  window: BrowserWindow
  show: () => void
  reportSaveFailure: () => void
  activate: () => void
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
  const privateSession = new PrivateModeSession()
  let privateWindow: BrowserWindow | undefined
  let privatePreviousShown = false
  let suspended = false
  let generalWindow: BrowserWindow | undefined
  let generalPreviousShown: boolean | undefined
  let eventAudience: Audience | undefined
  let saveFailed = false
  let saveSequence = 0
  const player = new EventPlayer(
    eventCatalog,
    () => memory().snapshot(),
    (id, progress) => {
      memory().eventCheckpoint(id, progress)
      const sequence = ++saveSequence
      void saveCheckpoint()
        .then(() => {
          if (sequence === saveSequence) {
            saveFailed = false
            publishEvents()
            publish()
          }
        })
        .catch(() => {
          if (sequence === saveSequence) reportSaveFailure()
        })
    },
  )
  let outfitToken = 0
  let pendingOutfit:
    | { id: OutfitId; token: number; finish: (ready: boolean) => void }
    | undefined
  let revision = 0
  function presentation(): PresentationState {
    return {
      revision,
      outfits: characterRegistry.outfits,
      outfitRequest: pendingOutfit
        ? { id: pendingOutfit.id, token: pendingOutfit.token }
        : null,
      saveFailed,
      eventPaused:
        generalPreviousShown !== undefined ||
        privateSession.snapshot().phase === 'active',
      visible: shown,
      settings: memory().snapshot().settings,
    }
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
    leaveEvents('restore')
    leavePrivate('restore')
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show()
      settingsWindow.focus()
      return
    }
    const created = createSettingsWindow()
    settingsWindow = created
    created.on('closed', () => {
      if (settingsWindow === created) {
        pendingOutfit?.finish(false)
        settingsWindow = undefined
      }
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

  function showDesktop(): void {
    stopDrag()
    interactive = false
    keepOnScreen()
    updateMouse()
    shown = true
    window.showInactive()
    refreshTray()
    publish()
  }

  function hideDesktop(): void {
    stopDrag()
    shown = false
    window.hide()
    refreshTray()
    publish()
  }

  function show(): void {
    leaveEvents('keep')
    leavePrivate('keep')
    showDesktop()
  }
  function hide(): void {
    leaveEvents('keep')
    leavePrivate('keep')
    hideDesktop()
  }
  function leavePrivate(visibility: 'restore' | 'hidden' | 'keep'): void {
    if (privateSession.snapshot().phase === 'closed' && !privateWindow) return
    if (eventAudience === 'private') {
      player.close()
      eventAudience = undefined
    }
    privateSession.close()
    const created = privateWindow
    privateWindow = undefined
    // Destroy before restoring other windows; no private DOM can survive re-entry.
    if (created && !created.isDestroyed()) created.destroy()
    interactionEligible = false
    if (window.isDestroyed()) return
    if (visibility === 'hidden') hideDesktop()
    else if (visibility === 'restore') {
      if (privatePreviousShown && !quitting) showDesktop()
      else hideDesktop()
    }
  }
  function publishPrivate(): void {
    if (privateWindow && !privateWindow.isDestroyed())
      privateWindow.webContents.send(
        channels.privateChanged,
        privateSession.snapshot(),
      )
  }
  function openPrivate(): void {
    if (quitting || resetPending || suspended)
      throw new Error('Mode unavailable')
    if (privateWindow) return
    leaveEvents('restore')
    privatePreviousShown = window.isVisible()
    privateSession.request()
    const created = createPrivateModeWindow()
    privateWindow = created
    settingsWindow?.hide()
    created.once('ready-to-show', () => {
      if (privateWindow === created && !suspended && !quitting) created.show()
    })
    created.on('blur', () => {
      if (privateWindow !== created) return
      privateSession.blur(memory().snapshot().settings.privateHideOnBlur)
      if (privateSession.snapshot().phase === 'closed') leavePrivate('hidden')
      else {
        player.pause()
        publishEvents()
        publishPrivate()
      }
    })
    created.on('close', (event) => {
      event.preventDefault()
      leavePrivate('restore')
    })
    created.on('closed', () => {
      if (privateWindow === created) leavePrivate('hidden')
    })
    created.on('minimize', () => {
      if (privateWindow === created) leavePrivate('hidden')
    })
    created.on('hide', () => {
      if (privateWindow === created) leavePrivate('hidden')
    })
    created.webContents.on('will-navigate', (event) => {
      event.preventDefault()
      leavePrivate('hidden')
    })
    created.webContents.on('render-process-gone', () => {
      if (privateWindow === created) leavePrivate('hidden')
    })
    let loadedOnce = false
    created.webContents.on('did-start-loading', () => {
      if (loadedOnce && privateWindow === created) leavePrivate('hidden')
      loadedOnce = true
    })
    const loaded = process.env.ELECTRON_RENDERER_URL
      ? created.loadURL(
          new URL('/private-mode.html', process.env.ELECTRON_RENDERER_URL).href,
        )
      : created.loadFile(join(__dirname, '../renderer/private-mode.html'))
    void loaded.catch(() => {
      if (privateWindow === created) leavePrivate('restore')
    })
  }

  function eventView() {
    return {
      ...player.view(saveFailed),
      outfitId: memory().snapshot().settings.outfitId,
    }
  }
  function publishEvents(): void {
    const target =
      eventAudience === 'general'
        ? generalWindow
        : eventAudience === 'private'
          ? privateWindow
          : undefined
    if (target && !target.isDestroyed())
      target.webContents.send(channels.eventChanged, eventView())
  }
  function reportSaveFailure(): void {
    saveFailed = true
    publishEvents()
    publish()
  }
  function leaveEvents(visibility: 'restore' | 'hidden' | 'keep'): void {
    if (!generalWindow) return
    const created = generalWindow,
      previous = generalPreviousShown
    generalWindow = undefined
    generalPreviousShown = undefined
    if (eventAudience === 'general') {
      player.close()
      eventAudience = undefined
    }
    if (!created.isDestroyed()) created.destroy()
    if (window.isDestroyed()) return
    if (visibility === 'hidden') hideDesktop()
    else if (visibility === 'restore' && previous !== undefined) {
      if (previous && !quitting) showDesktop()
      else hideDesktop()
    }
  }
  function openEvents(): void {
    if (quitting || resetPending || suspended) return
    if (generalWindow) {
      generalWindow.show()
      generalWindow.focus()
      return
    }
    leavePrivate('restore')
    player.open('general')
    eventAudience = 'general'
    const created = createEventWindow()
    generalWindow = created
    settingsWindow?.hide()
    created.once('ready-to-show', () => {
      if (generalWindow === created && !quitting && !suspended) created.show()
    })
    created.on('blur', () => {
      if (generalWindow === created) {
        player.pause()
        publishEvents()
      }
    })
    created.on('close', (event) => {
      event.preventDefault()
      leaveEvents('restore')
    })
    const conceal = (): void => {
      if (generalWindow === created) leaveEvents('hidden')
    }
    created.on('hide', conceal)
    created.on('minimize', conceal)
    created.on('closed', conceal)
    created.webContents.on('will-navigate', (event) => {
      event.preventDefault()
      leaveEvents('hidden')
    })
    created.webContents.on('render-process-gone', () => {
      if (generalWindow === created) leaveEvents('hidden')
    })
    let loading = false
    created.webContents.on('did-start-loading', () => {
      if (loading && generalWindow === created) leaveEvents('hidden')
      loading = true
    })
    const loaded = process.env.ELECTRON_RENDERER_URL
      ? created.loadURL(
          new URL('/events.html', process.env.ELECTRON_RENDERER_URL).href,
        )
      : created.loadFile(join(__dirname, '../renderer/events.html'))
    void loaded.catch(() => {
      if (generalWindow === created) leaveEvents('restore')
    })
  }

  function menuItems(): MenuItemConstructorOptions[] {
    return [
      { label: '設定…', click: openSettings },
      { label: 'お話・イベント…', click: openEvents },
      { label: '表示', enabled: !shown, click: show },
      {
        label: '非表示',
        enabled: shown || !!privateWindow || !!generalWindow,
        click: hide,
      },
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
          pendingOutfit?.finish(false)
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
            leaveEvents('keep')
            leavePrivate('keep')
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
    if (!window.isVisible()) return
    // Delayed native show notifications must not cancel a newly opened mode.
    if (
      privateSession.snapshot().phase === 'active' ||
      generalPreviousShown !== undefined
    ) {
      hideDesktop()
      return
    }
    shown = true
    keepOnScreen()
    refreshTray()
    publish()
  })
  window.on('hide', () => {
    if (window.isVisible()) return
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
  const trustedPrivate = (
    event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>,
  ): boolean =>
    !!privateWindow &&
    !privateWindow.isDestroyed() &&
    event.sender === privateWindow.webContents &&
    event.senderFrame === privateWindow.webContents.mainFrame
  const eventTarget = (
    event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>,
  ): BrowserWindow | undefined => {
    const target =
      eventAudience === 'general'
        ? generalWindow
        : eventAudience === 'private' &&
            privateSession.snapshot().phase === 'active'
          ? privateWindow
          : undefined
    return target &&
      !target.isDestroyed() &&
      event.sender === target.webContents &&
      event.senderFrame === target.webContents.mainFrame
      ? target
      : undefined
  }
  ipcMain.handle(channels.eventOpen, (event) => {
    if (!trustedSettings(event) || !settingsWindow!.isFocused())
      throw Error('Untrusted event entry')
    openEvents()
  })
  ipcMain.handle(channels.eventGet, (event) => {
    if (!eventTarget(event)) throw Error('Untrusted event request')
    return eventView()
  })
  ipcMain.handle(channels.eventCommand, (event, command: unknown) => {
    const target = eventTarget(event)
    if (
      !target ||
      quitting ||
      resetPending ||
      suspended ||
      !isEventCommand(command)
    )
      throw Error('Invalid event command')
    if (command.kind === 'return' || command.kind === 'hide') {
      if (eventAudience === 'general')
        leaveEvents(command.kind === 'hide' ? 'hidden' : 'restore')
      else leavePrivate(command.kind === 'hide' ? 'hidden' : 'restore')
      return eventView()
    }
    if (command.revision !== player.view().revision)
      throw Error('Stale event command')
    if (!target.isFocused()) throw Error('Event must be focused')
    const before = player.view()
    player.apply(command)
    if (command.kind === 'resume' && eventAudience === 'private') {
      privateSession.resume(privateSession.snapshot().session)
      publishPrivate()
    }
    const after = player.view()
    if (eventAudience === 'general') {
      if (before.phase !== 'playing' && after.phase === 'playing') {
        generalPreviousShown = window.isVisible()
        interactionEligible = false
        hideDesktop()
      } else if (
        before.phase === 'playing' &&
        after.phase === 'list' &&
        generalPreviousShown !== undefined
      ) {
        const previous = generalPreviousShown
        generalPreviousShown = undefined
        if (previous) showDesktop()
        else hideDesktop()
      }
    }
    if (after.phase === 'completed') {
      if (eventAudience === 'general') leaveEvents('restore')
      else leavePrivate('restore')
    } else publishEvents()
    return eventView()
  })
  ipcMain.handle(channels.privateOpen, (event) => {
    if (
      !trustedSettings(event) ||
      !settingsWindow!.isVisible() ||
      !settingsWindow!.isFocused()
    )
      throw new Error('Untrusted mode entry')
    openPrivate()
  })
  ipcMain.handle(channels.privateGet, (event) => {
    if (!trustedPrivate(event)) throw new Error('Untrusted mode request')
    return privateSession.snapshot()
  })
  ipcMain.handle(channels.privateCommand, (event, command: unknown) => {
    if (
      !trustedPrivate(event) ||
      quitting ||
      suspended ||
      !isPrivateModeCommand(command) ||
      command.session !== privateSession.snapshot().session
    )
      throw new Error('Invalid mode command')
    if (command.kind === 'return' || command.kind === 'hide') {
      leavePrivate(command.kind === 'hide' ? 'hidden' : 'restore')
      return
    }
    if (!privateWindow!.isFocused()) throw new Error('Mode must be focused')
    if (command.kind === 'confirm') {
      if (!privateSession.confirm(command.accepted, command.session))
        throw new Error('Confirmation required')
      interactionEligible = false
      player.open('private')
      eventAudience = 'private'
      hideDesktop()
    } else {
      privateSession.resume(command.session)
      if (eventAudience === 'private') {
        player.resume()
        publishEvents()
      }
    }
    publishPrivate()
  })
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
  ipcMain.handle(channels.outfitApply, async (event, id: unknown) => {
    if (
      !trustedSettings(event) ||
      quitting ||
      resetPending ||
      pendingOutfit ||
      !isOutfitId(id) ||
      !characterRegistry.outfits.some((o) => o.id === id && o.available)
    )
      throw Error('Outfit unavailable')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const ready = await new Promise<boolean>((finish) => {
        pendingOutfit = { id, token: ++outfitToken, finish }
        timer = setTimeout(() => finish(false), 8000)
        publish()
      })
      if (!ready || quitting || resetPending || !trustedSettings(event))
        throw Error('Outfit preparation failed')
      const settings = memory().snapshot().settings
      memory().settings({ ...settings, outfitId: id })
      persist()
    } finally {
      clearTimeout(timer)
      pendingOutfit = undefined
      publish()
    }
    return presentation()
  })
  const outfitResult = (
    event: IpcMainEvent,
    token: unknown,
    ready: unknown,
  ): void => {
    if (
      trusted(event) &&
      pendingOutfit &&
      token === pendingOutfit.token &&
      typeof ready === 'boolean'
    )
      pendingOutfit.finish(ready)
  }
  ipcMain.on(channels.outfitResult, outfitResult)
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
  function publicMemory(
    state = memory().snapshot(),
  ): ReturnType<MemorySession['snapshot']> {
    state.events = Object.fromEntries(
      Object.entries(state.events).filter(([id]) =>
        eventCatalog.some(
          (event) => event.id === id && event.audience === 'general',
        ),
      ),
    )
    return state
  }
  ipcMain.handle(channels.memory, (event) => {
    if (!trusted(event)) throw new Error('Untrusted memory request')
    return publicMemory()
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
      return publicMemory(state)
    }
    return publicMemory()
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
    suspended = true
    interactionEligible = false
    memory().power(true)
    persist()
    if (!window.webContents.isDestroyed())
      window.webContents.send(channels.power, 'suspend')
    leaveEvents('restore')
    leavePrivate('restore')
  }
  const resume = (): void => {
    suspended = false
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
    pendingOutfit?.finish(false)
    leaveEvents('hidden')
    leavePrivate('hidden')
    stopDrag()
  }
  app.on('before-quit', beforeQuit)
  screen.on('display-removed', keepOnScreen)
  screen.on('display-added', keepOnScreen)
  screen.on('display-metrics-changed', keepOnScreen)
  window.on('closed', () => {
    if (dragTimer) clearInterval(dragTimer)
    tray.destroy()
    leaveEvents('hidden')
    leavePrivate('hidden')
    settingsWindow?.destroy()
    for (const channel of [
      channels.eventGet,
      channels.eventCommand,
      channels.eventOpen,
      channels.privateGet,
      channels.privateCommand,
      channels.privateOpen,
      channels.presentation,
      channels.settingsGet,
      channels.settingsUpdate,
      channels.settingsVisible,
      channels.outfitApply,
    ])
      ipcMain.removeHandler(channel)
    ipcMain.removeHandler(channels.launch)
    ipcMain.removeHandler(channels.dragEnd)
    ipcMain.removeHandler(channels.memory)
    ipcMain.removeHandler(channels.interaction)
    pendingOutfit?.finish(false)
    ipcMain.removeListener(channels.outfitResult, outfitResult)
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
    pendingOutfit?.finish(false)
    interactionEligible = false
    interactive = false
    stopDrag()
  })
  window.once('ready-to-show', () => {
    if (memory().snapshot().settings.showOnStartup) show()
    else hide()
  })
  updateMouse()
  return {
    window,
    show,
    reportSaveFailure,
    activate: () => {
      // macOS can deliver activate after a deliberate settings/mode focus change.
      // Do not interpret that notification as a request to leave an open screen.
      if (privateWindow || generalWindow || settingsWindow?.isVisible()) return
      show()
    },
  }
}
