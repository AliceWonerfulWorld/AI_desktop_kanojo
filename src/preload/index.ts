import { contextBridge, ipcRenderer } from 'electron'
import { channels, type DesktopAPI } from '../shared/desktop-api'

const api: DesktopAPI = {
  getPresentation: () => ipcRenderer.invoke(channels.presentation),
  onPresentation: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: import('../shared/presentation').PresentationState,
    ): void => listener(state)
    ipcRenderer.on(channels.presentation, handler)
    return () => {
      ipcRenderer.removeListener(channels.presentation, handler)
    }
  },
  getMemory: () => ipcRenderer.invoke(channels.memory),
  recordInteraction: () => ipcRenderer.invoke(channels.interaction),
  recordAction: (action) => ipcRenderer.send(channels.action, action),
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
  finishDrag: () => ipcRenderer.invoke(channels.dragEnd),
  openMenu: () => ipcRenderer.send(channels.menu),
}

contextBridge.exposeInMainWorld('desktop', api)
