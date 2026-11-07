export const channels = {
  pointer: 'desktop:pointer',
  drag: 'desktop:drag',
  menu: 'desktop:menu',
} as const

export interface DesktopAPI {
  readonly versions: Readonly<{
    electron: string
    chrome: string
    node: string
  }>
  setPointerInteractive(interactive: boolean): void
  setDragging(dragging: boolean): void
  openMenu(): void
}
