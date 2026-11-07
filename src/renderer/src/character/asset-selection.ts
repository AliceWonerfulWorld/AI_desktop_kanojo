import type {
  Action,
  CharacterVisualState,
  Expression,
} from '../../../shared/character-state'

export interface CharacterAsset {
  readonly id: string
  readonly url: string
  readonly action: Action
  readonly expression: Expression
}

/** Exact pair → same expression at idle → action neutral → idle neutral. */
export function assetCandidates(
  state: CharacterVisualState,
  assets: readonly CharacterAsset[],
): CharacterAsset[] {
  const pairs: CharacterVisualState[] = [
    state,
    { action: 'idle', expression: state.expression },
    { action: state.action, expression: 'neutral' },
    { action: 'idle', expression: 'neutral' },
  ]
  return [
    ...new Set(
      pairs.flatMap((pair) =>
        assets.filter(
          (asset) =>
            asset.action === pair.action &&
            asset.expression === pair.expression,
        ),
      ),
    ),
  ]
}
