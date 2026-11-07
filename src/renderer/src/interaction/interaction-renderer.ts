import type { BehaviorClock } from '../../../behavior/behavior-engine'
import {
  chooseResponse,
  type InteractionResponse,
} from '../../../interaction/responses.ts'
import type { CharacterVisualState } from '../../../shared/character-state'
import type { CharacterRenderer, RenderResult } from '../character/renderer'
import type { GreetingPresenter } from '../dialogue/greeting'

export interface InteractionEvent extends InteractionResponse {
  readonly action: CharacterVisualState['action']
}

/** Temporary presentation only. It never pauses, wakes or mutates the behavior engine. */
export class InteractionRenderer implements CharacterRenderer {
  private baseState: CharacterVisualState | undefined
  private reaction: InteractionResponse | undefined
  private readonly lastResponse = new Map<string, string>()
  private nextAllowedAt = -Infinity
  private cancel: (() => void) | undefined
  private generation = 0
  private disposed = false
  private readonly base: CharacterRenderer
  private readonly bubble: Pick<GreetingPresenter, 'show' | 'hide'>
  private readonly clock: BehaviorClock
  private readonly random: () => number
  private readonly notify: (event: InteractionEvent) => void

  constructor(
    base: CharacterRenderer,
    bubble: Pick<GreetingPresenter, 'show' | 'hide'>,
    clock: BehaviorClock,
    random: () => number = Math.random,
    notify: (event: InteractionEvent) => void = () => {},
  ) {
    this.base = base
    this.bubble = bubble
    this.clock = clock
    this.random = random
    this.notify = notify
  }
  setState(state: CharacterVisualState): Promise<RenderResult> {
    if (this.disposed)
      return Promise.resolve({
        state,
        applied: false,
        assetId: null,
        fallback: true,
        unavailable: [],
      })
    const changedAction = this.baseState?.action !== state.action
    this.baseState = { ...state }
    if (changedAction) this.clearReaction()
    return this.base.setState(this.visualState())
  }
  hitTest(x: number, y: number): boolean {
    return !this.disposed && this.base.hitTest(x, y)
  }
  react(): InteractionEvent | null {
    if (
      this.disposed ||
      !this.baseState ||
      this.clock.now() < this.nextAllowedAt
    )
      return null
    const action = this.baseState.action
    const response = chooseResponse(
      action,
      this.random,
      this.lastResponse.get(action),
    )
    if (!this.bubble.show(response.text, 3000, 'interaction')) return null
    this.clearReaction(false)
    this.reaction = response
    this.lastResponse.set(action, response.id)
    this.nextAllowedAt =
      this.clock.now() + (action === 'sleeping' ? 15000 : 3000)
    const generation = this.generation
    this.render()
    this.cancel = this.clock.schedule(() => {
      if (generation !== this.generation || this.disposed) return
      this.clearReaction()
      this.render()
    }, 3000)
    const event = Object.freeze({ ...response, action })
    this.notify(event)
    return event
  }
  cancelReaction(): void {
    this.clearReaction()
    if (this.baseState && !this.disposed) this.render()
  }
  private visualState(): CharacterVisualState {
    const state = this.baseState!
    return this.reaction
      ? { ...state, expression: this.reaction.expression }
      : state
  }
  private render(): void {
    void this.base
      .setState(this.visualState())
      .catch((error: unknown) =>
        console.error('Interaction rendering failed', error),
      )
  }
  private clearReaction(hide = true): void {
    this.generation++
    this.cancel?.()
    this.cancel = undefined
    if (hide && this.reaction) this.bubble.hide()
    this.reaction = undefined
  }
  dispose(): void {
    if (this.disposed) return
    this.clearReaction()
    this.disposed = true
    this.lastResponse.clear()
    this.base.dispose()
  }
}
