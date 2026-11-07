import type { BehaviorEngine } from '../../../behavior/behavior-engine'

export function installBehaviorPreview(engine: BehaviorEngine): () => void {
  Object.defineProperty(window, 'behaviorPreview', {
    configurable: true,
    value: Object.freeze({
      getState: () => engine.getSnapshot(),
      start: () => engine.start(),
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      stop: () => engine.stop(),
    }),
  })
  return () => {
    Reflect.deleteProperty(window, 'behaviorPreview')
  }
}
