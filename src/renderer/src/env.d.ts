import type { DesktopAPI } from '../../shared/desktop-api'

declare global {
  interface Window {
    readonly desktop: DesktopAPI
  }
}
