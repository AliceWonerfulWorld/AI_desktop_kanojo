import type { EventsAPI } from '../../shared/events-api'
import type { PrivateModeAPI } from '../../shared/private-mode'
import type { DesktopAPI } from '../../shared/desktop-api'
import type { SettingsAPI } from '../../shared/presentation'

declare global {
  interface Window {
    readonly events: EventsAPI
    readonly privateMode: PrivateModeAPI
    readonly desktop: DesktopAPI
    readonly settings: SettingsAPI
  }
}
