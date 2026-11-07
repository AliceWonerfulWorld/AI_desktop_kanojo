export interface DesktopAPI {
  readonly versions: Readonly<{
    electron: string
    chrome: string
    node: string
  }>
}
