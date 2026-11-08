import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
export function createEventWindow(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea
  const window = new BrowserWindow({
    title: 'お話・イベント',
    width: Math.min(960, area.width),
    height: Math.min(640, area.height),
    minWidth: Math.min(640, area.width),
    minHeight: Math.min(480, area.height),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f4f0',
    webPreferences: {
      preload: join(__dirname, '../preload/events.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  window.setIgnoreMouseEvents(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return window
}
