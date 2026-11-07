import type { Action } from '../shared/character-state.ts'
import { validateMemory, type MemoryState } from '../shared/memory-state.ts'
import { relationshipStage } from '../relationship/relationship.ts'

/** Main-owned session accounting: no wall-clock subtraction or offline catch-up. */
export class MemorySession {
  private readonly now: () => number
  private state: MemoryState
  private tickAt: number
  private suspended = false
  constructor(state: MemoryState, now: () => number, launchedAt: string) {
    this.now = now
    this.state = validateMemory(state)
    this.state.lastLaunchedAt = launchedAt
    this.tickAt = now()
  }
  private tick(): void {
    const now = this.now()
    const elapsed = Math.max(0, now - this.tickAt)
    this.tickAt = Math.max(this.tickAt, now)
    if (this.suspended) return
    this.state.totalActiveMs = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.state.totalActiveMs + elapsed,
    )
    this.state.affectionCooldownMs = Math.max(
      0,
      this.state.affectionCooldownMs - elapsed,
    )
    this.state.interactionCooldownMs = Math.max(
      0,
      this.state.interactionCooldownMs - elapsed,
    )
  }
  snapshot(): MemoryState {
    this.tick()
    return structuredClone(this.state)
  }
  power(suspend: boolean): void {
    this.tick()
    this.suspended = suspend
  }
  action(action: Action): void {
    this.state.lastAction = action
  }
  settings(settings: MemoryState['settings']): void {
    this.state.settings = validateMemory({
      ...this.snapshot(),
      settings,
    }).settings
  }
  interact(): MemoryState {
    this.tick()
    if (!this.suspended && this.state.interactionCooldownMs === 0) {
      this.state.interactionCount = Math.min(
        Number.MAX_SAFE_INTEGER,
        this.state.interactionCount + 1,
      )
      this.state.interactionCooldownMs =
        this.state.lastAction === 'sleeping' ? 15000 : 3000
      if (this.state.affectionCooldownMs === 0) {
        this.state.affection = Math.min(100, this.state.affection + 1)
        this.state.affectionCooldownMs = 60000
        this.state.relationshipStage = relationshipStage(this.state.affection)
      }
    }
    return this.snapshot()
  }
}
