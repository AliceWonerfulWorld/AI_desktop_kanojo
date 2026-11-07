import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 480,
    minHeight: 360,
    show: false,
    title: 'AI Desktop Kanojo',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('preload-error', (_event, path, error) => {
    console.error(`Preload failed: ${path}`, error)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process exited', details)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.webContents.openDevTools({ mode: 'detach' })
    void window.loadURL(process.env.ELECTRON_RENDERER_URL).catch(console.error)
  } else {
    void window
      .loadFile(join(__dirname, '../renderer/index.html'))
      .catch(console.error)
  }
}

void app
  .whenReady()
  .then(() => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === 'darwin'
          ? [{ role: 'appMenu' as const }]
          : []),
        { role: 'fileMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
      ]),
    )
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    console.error('Application startup failed', error)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
