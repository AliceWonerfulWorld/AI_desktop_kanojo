import { contextBridge } from 'electron'
import type { DesktopAPI } from '../shared/desktop-api'

const api: DesktopAPI = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
}

contextBridge.exposeInMainWorld('desktop', api)
