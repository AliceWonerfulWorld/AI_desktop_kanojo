export const channels = {
  pointer: 'desktop:pointer',
  drag: 'desktop:drag',
  dragEnd: 'desktop:drag-end',
  menu: 'desktop:menu',
  launch: 'desktop:launch',
  power: 'desktop:power',
} as const

export interface LaunchInfo {
  readonly firstLaunch: boolean
}
export type DragResult = 'click' | 'drag' | 'cancelled'
export type PowerState = 'suspend' | 'resume'

export interface DesktopAPI {
  getLaunchInfo(): Promise<LaunchInfo>
  onPowerState(listener: (state: PowerState) => void): () => void
  readonly versions: Readonly<{
    electron: string
    chrome: string
    node: string
  }>
  setPointerInteractive(interactive: boolean): void
  setDragging(dragging: boolean): void
  finishDrag(): Promise<DragResult>
  openMenu(): void
}
