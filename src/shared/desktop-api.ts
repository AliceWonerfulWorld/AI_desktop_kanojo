export const channels = {
  pointer: 'desktop:pointer',
  drag: 'desktop:drag',
  dragEnd: 'desktop:drag-end',
  menu: 'desktop:menu',
  launch: 'desktop:launch',
  power: 'desktop:power',
  memory: 'desktop:memory',
  interaction: 'desktop:interaction',
  action: 'desktop:action',
} as const

export interface LaunchInfo {
  readonly firstLaunch: boolean
}
export type DragResult = 'click' | 'drag' | 'cancelled'
export type PowerState = 'suspend' | 'resume'

export interface DesktopAPI {
  getMemory(): Promise<MemoryState>
  recordInteraction(): Promise<MemoryState>
  recordAction(action: Action): void
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
import type { MemoryState } from './memory-state'
import type { Action } from './character-state'
