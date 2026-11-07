import type { BehaviorEngine } from './behavior-engine'

/** One owner for overlapping visibility, user pause and OS suspend reasons. */
export function createPresentationPause(
  engine: BehaviorEngine,
): (blocked: boolean) => void {
  let ownsPause = false
  return (blocked) => {
    const status = engine.getSnapshot().status
    if (blocked && status === 'running') {
      engine.pause()
      ownsPause = true
    } else if (!blocked && ownsPause) {
      ownsPause = false
      if (status === 'paused') engine.resume()
    }
  }
}
