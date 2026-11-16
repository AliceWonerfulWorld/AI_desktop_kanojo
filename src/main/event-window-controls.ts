import { BrowserWindow, screen } from 'electron'
import type { EventWindowCommand, EventWindowState } from '../shared/events-api'

const controls = new WeakMap<
  BrowserWindow,
  (command: EventWindowCommand) => EventWindowState
>()

/** Window presentation is ephemeral, independent of story checkpoints and consent. */
export function attachEventWindowControls(window: BrowserWindow): void {
  let transitioning = false
  let restore: { bounds: Electron.Rectangle; maximized: boolean } | undefined
  const isFullscreen = (): boolean =>
    window.isFullScreen() || window.isSimpleFullScreen()
  const state = (): EventWindowState => ({
    maximized: window.isMaximized(),
    fullscreen: isFullscreen(),
    transitioning,
  })
  const publish = (): void => {
    if (!window.isDestroyed())
      window.webContents.send('events:window-changed', state())
  }
  const restoreBounds = (): void => {
    if (!restore || window.isDestroyed()) return
    const saved = restore
    restore = undefined
    // DIP coordinates; clamp against the current display if it was disconnected.
    const area = screen.getDisplayMatching(saved.bounds).workArea
    const width = Math.min(saved.bounds.width, area.width)
    const height = Math.min(saved.bounds.height, area.height)
    window.unmaximize()
    window.setBounds({
      width,
      height,
      x: Math.max(
        area.x,
        Math.min(saved.bounds.x, area.x + area.width - width),
      ),
      y: Math.max(
        area.y,
        Math.min(saved.bounds.y, area.y + area.height - height),
      ),
    })
    if (saved.maximized) window.maximize()
  }
  window.on('enter-full-screen', () => {
    transitioning = false
    publish()
  })
  window.on('leave-full-screen', () => {
    transitioning = false
    restoreBounds()
    publish()
  })
  window.on('maximize', publish)
  window.on('unmaximize', publish)
  window.on('resize', publish)
  controls.set(window, (command) => {
    if (command === 'get' || transitioning) return state()
    if (command === 'fullscreen' && !isFullscreen()) {
      restore = {
        bounds: window.getNormalBounds(),
        maximized: window.isMaximized(),
      }
      if (process.platform === 'darwin') {
        // Spaces transitions emit hide/blur on macOS. Keep strict privacy handlers
        // intact and use the non-Spaces presentation instead.
        window.setSimpleFullScreen(true)
      } else {
        transitioning = true
        window.setFullScreen(true)
      }
    } else if (isFullscreen()) {
      if (window.isSimpleFullScreen()) {
        window.setSimpleFullScreen(false)
        restoreBounds()
      } else {
        transitioning = true
        window.setFullScreen(false)
      }
    } else if (command === 'maximize') {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    } else if (command === 'restore') window.unmaximize()
    publish()
    return state()
  })
}
export function controlEventWindow(
  window: BrowserWindow,
  command: EventWindowCommand,
): EventWindowState {
  const control = controls.get(window)
  if (!control) throw Error('Event window unavailable')
  return control(command)
}
