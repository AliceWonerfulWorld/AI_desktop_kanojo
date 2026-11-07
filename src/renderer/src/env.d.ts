import type { DesktopAPI } from '../../shared/desktop-api'
import type { SettingsAPI } from '../../shared/presentation'

declare global {
  interface Window {
    readonly desktop: DesktopAPI
    readonly settings: SettingsAPI
  }
}
