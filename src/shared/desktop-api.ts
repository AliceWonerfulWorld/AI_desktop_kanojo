export const channels = {
  outfitResult: 'desktop:outfit-result',
  outfitApply: 'settings:outfit-apply',
  pointer: 'desktop:pointer',
  drag: 'desktop:drag',
  dragEnd: 'desktop:drag-end',
  menu: 'desktop:menu',
  launch: 'desktop:launch',
  power: 'desktop:power',
  memory: 'desktop:memory',
  interaction: 'desktop:interaction',
  action: 'desktop:action',
  presentation: 'desktop:presentation',
  eventGet: 'events:get',
  eventCommand: 'events:command',
  eventChanged: 'events:changed',
  eventOpen: 'settings:event-open',
  privateGet: 'private:get',
  privateCommand: 'private:command',
  privateChanged: 'private:changed',
  privateOpen: 'settings:private-open',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsVisible: 'settings:visible',
  settingsChanged: 'settings:changed',
} as const

export interface LaunchInfo {
  readonly firstLaunch: boolean
}
export type DragResult = 'click' | 'drag' | 'cancelled'
export type PowerState = 'suspend' | 'resume'

export interface DesktopAPI {
  reportOutfitReady(token: number, ready: boolean): void
  getPresentation(): Promise<PresentationState>
  onPresentation(listener: (state: PresentationState) => void): () => void
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
import type { PresentationState } from './presentation'
