export const outfitIds = ['default', 'loungewear'] as const
export type OutfitId = (typeof outfitIds)[number]
export function isOutfitId(value: unknown): value is OutfitId {
  return outfitIds.some((id) => id === value)
}
export interface OutfitOption {
  readonly id: OutfitId
  readonly label: string
  readonly available: boolean
}
export interface OutfitRequest {
  readonly token: number
  readonly id: OutfitId
}
