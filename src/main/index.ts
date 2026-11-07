import { app, Menu } from 'electron'
import { join } from 'node:path'
import { createDesktopWindow } from './desktop-window'

let desktop: ReturnType<typeof createDesktopWindow> | undefined

function createWindow(): void {
  desktop = createDesktopWindow()
  const { window } = desktop
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('preload-error', (_event, path, error) => {
    console.error(`Preload failed: ${path}`, error)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process exited', details)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    // DevTools can change transparent-window composition; open explicitly from the tray.
    void window.loadURL(process.env.ELECTRON_RENDERER_URL).catch(console.error)
  } else {
    void window
      .loadFile(join(__dirname, '../renderer/index.html'))
      .catch(console.error)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => desktop?.show())
  void app
    .whenReady()
    .then(() => {
      Menu.setApplicationMenu(
        process.platform === 'darwin'
          ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'viewMenu' }])
          : null,
      )
      createWindow()
      app.on('activate', () => desktop?.show())
    })
    .catch((error: unknown) => {
      console.error('Application startup failed', error)
      app.quit()
    })
}

app.on('window-all-closed', () => app.quit())
