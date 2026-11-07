import type { CharacterVisualState } from '../../../shared/character-state'

export interface RenderResult {
  readonly state: CharacterVisualState
  readonly assetId: string | null
  readonly applied: boolean
  readonly fallback: boolean
  readonly unavailable: readonly string[]
}

/** Stable boundary for PNG and future Live2D implementations. Client coordinates are CSS px. */
export interface CharacterRenderer {
  setState(state: CharacterVisualState): Promise<RenderResult>
  hitTest(clientX: number, clientY: number): boolean
  dispose(): void
}
