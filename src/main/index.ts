import { app, Menu, dialog } from 'electron'
import { join } from 'node:path'
import { loadLaunchInfo } from './launch-info'
import type { LaunchInfo } from '../shared/desktop-api'
import { createDesktopWindow } from './desktop-window'
import { MemoryStore } from './memory-store'
import { MemorySession } from './memory-session'
import { defaultMemory } from '../shared/memory-state'

let launchInfo: LaunchInfo = { firstLaunch: false }
let desktop: ReturnType<typeof createDesktopWindow> | undefined
let memory: MemorySession
let store: MemoryStore
let saveTimer: ReturnType<typeof setTimeout> | undefined
let checkpoint: ReturnType<typeof setInterval> | undefined
let resetting = false
let quitReady = false
let quitPending = false
let saveErrorShown = false
let resetFinished: Promise<void> | undefined

function saveError(error: unknown): void {
  console.error('Memory save failed', error)
  if (!saveErrorShown) {
    saveErrorShown = true
    dialog.showErrorBox(
      '生活記憶を保存できません',
      '保存先を確認してください。今回の変更は次回起動時に復元できない可能性があります。',
    )
  }
}
function persist(): void {
  if (resetting || quitPending || saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    void store.save(memory.snapshot()).catch(saveError)
  }, 500)
}
async function resetMemory(): Promise<void> {
  resetting = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  try {
    await store.reset()
    memory = new MemorySession(
      defaultMemory(),
      () => performance.now(),
      new Date().toISOString(),
    )
    await store.save(memory.snapshot())
    await loadLaunchInfo(app.getPath('userData'))
    saveErrorShown = false
  } finally {
    resetting = false
  }
}

function createWindow(): void {
  desktop = createDesktopWindow(
    launchInfo,
    () => memory,
    persist,
    () => {
      resetFinished = resetMemory()
      return resetFinished
    },
  )
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
    .then(async () => {
      launchInfo = await loadLaunchInfo(app.getPath('userData'))
      store = new MemoryStore(app.getPath('userData'))
      memory = new MemorySession(
        await store.load(),
        () => performance.now(),
        new Date().toISOString(),
      )
      if (store.recovery !== 'none') {
        void dialog.showMessageBox({
          type: 'warning',
          title: '生活記憶の復旧',
          message:
            store.recovery === 'backup'
              ? '保存データに問題があったため、前回のバックアップから復旧しました。'
              : '保存データを読み込めなかったため、初期状態で起動します。',
          detail: '元のデータは保存先に退避しています。',
          buttons: ['OK'],
        })
      }
      await store.save(memory.snapshot()).catch(saveError)
      checkpoint = setInterval(persist, 30000)
      app.on('before-quit', (event) => {
        if (quitReady) return
        event.preventDefault()
        if (quitPending) return
        quitPending = true
        if (checkpoint) clearInterval(checkpoint)
        if (saveTimer) clearTimeout(saveTimer)
        void (async () => {
          await resetFinished
          memory.power(true)
          await store.save(memory.snapshot())
        })()
          .catch(saveError)
          .finally(() => {
            quitReady = true
            app.quit()
          })
      })
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
      dialog.showErrorBox(
        '起動できませんでした',
        '生活記憶の保存先へのアクセスと起動ログを確認してください。',
      )
      app.quit()
    })
}

app.on('window-all-closed', () => app.quit())
