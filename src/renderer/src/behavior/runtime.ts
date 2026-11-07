import {
  BehaviorEngine,
  type BehaviorClock,
  type BehaviorEvent,
  type BehaviorOptions,
} from '../../../behavior/behavior-engine.ts'
import type { Action, Expression } from '../../../shared/character-state'
import type { CharacterRenderer } from '../character/renderer'

const expressionForAction: Readonly<Record<Action, Expression>> = {
  idle: 'neutral',
  reading: 'neutral',
  resting: 'smile',
  sleeping: 'sleepy',
}

export const browserBehaviorClock: BehaviorClock = {
  now: () => performance.now(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs)
    return () => clearTimeout(timer)
  },
}

/** Presentation policy lives here, not in the autonomous action engine. */
export function createBehaviorRuntime(
  renderer: CharacterRenderer,
  notify: (event: BehaviorEvent) => void,
  options: BehaviorOptions = { clock: browserBehaviorClock },
): BehaviorEngine {
  const engine = new BehaviorEngine(options)
  engine.subscribe((event) => {
    if (
      (event.reason === 'started' || event.reason === 'transition') &&
      event.snapshot.current
    ) {
      const action = event.snapshot.current.action
      void renderer
        .setState({ action, expression: expressionForAction[action] })
        .catch((error: unknown) =>
          console.error('Behavior rendering failed', error),
        )
    }
    // Dialogue and animation consumers receive meaning, without concrete text or image APIs.
    notify(event)
  })
  return engine
}
