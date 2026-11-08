import { contextBridge, ipcRenderer } from 'electron'
import type { SettingsAPI, PresentationState } from '../shared/presentation'

const api: SettingsAPI = {
  openPrivateMode: () => ipcRenderer.invoke('settings:private-open'),
  // No shared runtime imports: sandboxed preloads cannot require local Rollup chunks.
  getState: () => ipcRenderer.invoke('settings:get'),
  update: (patch) => ipcRenderer.invoke('settings:update', patch),
  setVisible: (visible) => ipcRenderer.invoke('settings:visible', visible),
  onChange: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: PresentationState,
    ): void => listener(state)
    ipcRenderer.on('settings:changed', handler)
    return () => {
      ipcRenderer.removeListener('settings:changed', handler)
    }
  },
}
contextBridge.exposeInMainWorld('settings', api)
