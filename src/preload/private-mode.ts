import { contextBridge, ipcRenderer } from 'electron'
import type { PrivateModeAPI, PrivateModeState } from '../shared/private-mode'
const api: PrivateModeAPI = {
  getState: () => ipcRenderer.invoke('private:get'),
  command: (command) => ipcRenderer.invoke('private:command', command),
  onChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: PrivateModeState,
    ): void => listener(state)
    ipcRenderer.on('private:changed', handler)
    return () => {
      ipcRenderer.removeListener('private:changed', handler)
    }
  },
}
contextBridge.exposeInMainWorld('privateMode', api)

const events: import('../shared/events-api').EventsAPI = {
  getView: () => ipcRenderer.invoke('events:get'),
  command: (command) => ipcRenderer.invoke('events:command', command),
  onChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      view: import('../shared/events-api').EventView,
    ): void => listener(view)
    ipcRenderer.on('events:changed', handler)
    return () => {
      ipcRenderer.removeListener('events:changed', handler)
    }
  },
}
contextBridge.exposeInMainWorld('events', events)
