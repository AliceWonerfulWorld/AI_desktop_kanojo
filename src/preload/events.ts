import { contextBridge, ipcRenderer } from 'electron'
import type { EventsAPI, EventView } from '../shared/events-api'
const api: EventsAPI = {
  getView: () => ipcRenderer.invoke('events:get'),
  command: (command) => ipcRenderer.invoke('events:command', command),
  onChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      view: EventView,
    ): void => listener(view)
    ipcRenderer.on('events:changed', handler)
    return () => {
      ipcRenderer.removeListener('events:changed', handler)
    }
  },
}
contextBridge.exposeInMainWorld('events', api)
