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

/** Exact expression first; missing intimacy expressions use smile before neutral. */
export function assetCandidates(
  state: CharacterVisualState,
  assets: readonly CharacterAsset[],
): CharacterAsset[] {
  const pairs: CharacterVisualState[] = [
    state,
    { action: 'idle', expression: state.expression },
    ...(['shy', 'affectionate'].includes(state.expression)
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
            asset.action === pair.action &&
            asset.expression === pair.expression,
        ),
      ),
    ),
  ]
}
