import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

/** Only neutral UI and all-ages dummy content ship in Issue #29. */
export function createPrivateModeWindow(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea
  const window = new BrowserWindow({
    title: 'お話・イベント',
    width: Math.min(960, area.width),
    height: Math.min(640, area.height),
    minWidth: Math.min(640, area.width),
    minHeight: Math.min(480, area.height),
    show: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    backgroundColor: '#f7f4f0',
    webPreferences: {
      preload: join(__dirname, '../preload/private-mode.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  window.setIgnoreMouseEvents(false)
  window.setContentProtection(true)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return window
}
