import { isCharacterVisualState } from '../../../shared/character-state'
import type { CharacterRenderer, RenderResult } from './renderer'

/** Loaded only behind import.meta.env.DEV, never a production control surface. */
export function installCharacterPreview(
  renderer: CharacterRenderer,
): () => void {
  let latest: RenderResult | undefined
  const preview = Object.freeze({
    async setState(state: unknown): Promise<RenderResult> {
      if (!isCharacterVisualState(state))
        throw new TypeError(
          'Expected a valid action and expression; normal is called neutral in code',
        )
      const result = await renderer.setState(state)
      if (result.applied) latest = result
      return result
    },
    getState: () => latest,
  })
  Object.defineProperty(window, 'characterPreview', {
    value: preview,
    configurable: true,
  })
  return () => {
    Reflect.deleteProperty(window, 'characterPreview')
  }
}
