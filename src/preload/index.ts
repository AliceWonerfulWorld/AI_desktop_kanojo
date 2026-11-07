import { contextBridge, ipcRenderer } from 'electron'
import { channels, type DesktopAPI } from '../shared/desktop-api'

const api: DesktopAPI = {
  getLaunchInfo: () => ipcRenderer.invoke(channels.launch),
  onPowerState: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: unknown,
    ): void => {
      if (state === 'suspend' || state === 'resume') listener(state)
    }
    ipcRenderer.on(channels.power, handler)
    return () => {
      ipcRenderer.removeListener(channels.power, handler)
    }
  },
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  setPointerInteractive: (interactive) =>
    ipcRenderer.send(channels.pointer, interactive),
  setDragging: (dragging) => ipcRenderer.send(channels.drag, dragging),
  openMenu: () => ipcRenderer.send(channels.menu),
}

contextBridge.exposeInMainWorld('desktop', api)
