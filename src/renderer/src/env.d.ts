import type { PrivateModeAPI } from '../../shared/private-mode'
import type { DesktopAPI } from '../../shared/desktop-api'
import type { SettingsAPI } from '../../shared/presentation'

declare global {
  interface Window {
    readonly privateMode: PrivateModeAPI
    readonly desktop: DesktopAPI
    readonly settings: SettingsAPI
  }
}
