import type { BehaviorEngine } from './behavior-engine'

/** Resume only a pause owned by the OS sleep lifecycle; preserve explicit user pauses/stops. */
export function createPowerLifecycle(
  engine: BehaviorEngine,
): (state: 'suspend' | 'resume') => boolean {
  let suspended = false
  let pausedBySystem = false
  return (state) => {
    if (state === 'suspend') {
      if (suspended) return false
      suspended = true
      pausedBySystem = engine.getSnapshot().status === 'running'
      if (pausedBySystem) engine.pause()
      return true
    }
    if (!suspended) return false
    suspended = false
    if (pausedBySystem) engine.resume()
    pausedBySystem = false
    return true
  }
}
