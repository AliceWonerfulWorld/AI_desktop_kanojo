import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

export function createSettingsWindow(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea
  const window = new BrowserWindow({
    title: '小春の設定',
    width: Math.min(440, area.width),
    height: Math.min(620, area.height),
    minWidth: Math.min(360, area.width),
    minHeight: Math.min(400, area.height),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f4f0',
    webPreferences: {
      preload: join(__dirname, '../preload/settings.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  const loaded = process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(
        new URL('/settings.html', process.env.ELECTRON_RENDERER_URL).href,
      )
    : window.loadFile(join(__dirname, '../renderer/settings.html'))
  void loaded.catch((error: unknown) =>
    console.error('Settings failed to load', error),
  )
  return window
}
