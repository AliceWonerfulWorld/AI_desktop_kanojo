import type { OutfitId, OutfitOption, OutfitRequest } from './outfits'
import type { MemoryState } from './memory-state'

export type DesktopSettings = MemoryState['settings']
export type SettingsPatch = Partial<
  Omit<DesktopSettings, 'windowBounds' | 'outfitId'>
>
export interface PresentationState {
  readonly outfits: readonly OutfitOption[]
  readonly outfitRequest: OutfitRequest | null
  readonly revision: number
  readonly eventPaused?: boolean
  readonly saveFailed?: boolean
  readonly visible: boolean
  readonly settings: DesktopSettings
}
export interface SettingsAPI {
  applyOutfit(id: OutfitId): Promise<PresentationState>
  openEvents(): Promise<void>
  openPrivateMode(): Promise<void>
  getState(): Promise<PresentationState>
  update(patch: SettingsPatch): Promise<PresentationState>
  setVisible(visible: boolean): Promise<PresentationState>
  onChange(listener: (state: PresentationState) => void): () => void
}
export function validateSettingsPatch(value: unknown): SettingsPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid settings')
  const result: SettingsPatch = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'scale') {
      if (
        typeof entry !== 'number' ||
        !Number.isFinite(entry) ||
        entry < 0.5 ||
        entry > 2
      )
        throw new RangeError('Invalid scale')
      result.scale = entry
    } else if (
      [
        'alwaysOnTop',
        'clickThrough',
        'spontaneousDialogue',
        'showOnStartup',
        'paused',
        'privateHideOnBlur',
      ].includes(key)
    ) {
      if (typeof entry !== 'boolean')
        throw new TypeError('Invalid setting flag')
      Object.assign(result, { [key]: entry })
    } else throw new TypeError('Unknown setting')
  }
  return result
}
