import type { OutfitId } from '../../../shared/outfits'
import type {
  Action,
  CharacterVisualState,
  Expression,
} from '../../../shared/character-state'

export interface CharacterAsset {
  readonly outfitId?: OutfitId
  readonly id: string
  readonly url: string
  readonly action: Action
  readonly expression: Expression
}

/** Never cross outfits. Legacy assets and states mean the default outfit. */
export function assetCandidates(
  state: CharacterVisualState,
  assets: readonly CharacterAsset[],
): CharacterAsset[] {
  const pairs: CharacterVisualState[] = [
    state,
    { action: 'idle', expression: state.expression },
    ...((state.outfitId ?? 'default') === 'default' &&
    ['shy', 'affectionate'].includes(state.expression)
      ? ([
          { action: state.action, expression: 'smile' },
          { action: 'idle', expression: 'smile' },
        ] as CharacterVisualState[])
      : []),
    { action: state.action, expression: 'neutral' },
    { action: 'idle', expression: 'neutral' },
  ]
  return [
    ...new Set(
      pairs.flatMap((pair) =>
        assets.filter(
          (asset) =>
            (asset.outfitId ?? 'default') === (state.outfitId ?? 'default') &&
            asset.action === pair.action &&
            asset.expression === pair.expression,
        ),
      ),
    ),
  ]
}
