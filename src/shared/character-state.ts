import { isOutfitId, type OutfitId } from './outfits.ts'
export const actions = ['idle', 'reading', 'resting', 'sleeping'] as const
export const expressions = [
  'neutral',
  'smile',
  'sleepy',
  'surprised',
  'shy',
  'affectionate',
] as const
export type Action = (typeof actions)[number]
export type Expression = (typeof expressions)[number]

/** Meaning only: no DOM, image paths, or Live2D parameters. */
export interface CharacterVisualState {
  readonly outfitId?: OutfitId
  readonly action: Action
  readonly expression: Expression
}

export function isCharacterVisualState(
  value: unknown,
): value is CharacterVisualState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return (
    (state.outfitId === undefined || isOutfitId(state.outfitId)) &&
    actions.some((action) => action === state.action) &&
    expressions.some((expression) => expression === state.expression)
  )
}
