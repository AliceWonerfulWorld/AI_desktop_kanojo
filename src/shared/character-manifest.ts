import {
  isCharacterVisualState,
  type Action,
  type Expression,
} from './character-state.ts'
import { isOutfitId, type OutfitId, type OutfitOption } from './outfits.ts'
export interface ManifestAsset {
  id: string
  file: string
  outfitId: OutfitId
  action: Action
  expression: Expression
}
export interface CharacterManifest {
  outfits: readonly OutfitOption[]
  assets: readonly ManifestAsset[]
}
/** Validate mappings independently of Electron, URLs, decoders and provenance text. */
export function validateCharacterManifest(value: unknown): CharacterManifest {
  if (!value || typeof value !== 'object')
    throw Error('Invalid character manifest')
  const m = value as Record<string, unknown>
  if (
    m.schemaVersion !== 1 ||
    !Array.isArray(m.assets) ||
    m.assets.length > 128 ||
    !Array.isArray(m.outfits) ||
    m.outfits.length !== 2
  )
    throw Error('Invalid character registry')
  const ids = new Set<string>(),
    files = new Set<string>(),
    states = new Set<string>()
  const outfits: OutfitOption[] = m.outfits.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw Error('Invalid outfit')
    const o = entry as Record<string, unknown>
    if (
      !isOutfitId(o.id) ||
      ids.has(o.id) ||
      typeof o.label !== 'string' ||
      !o.label.length ||
      o.label.length > 40 ||
      !['ready', 'pending'].includes(String(o.status))
    )
      throw Error('Invalid outfit metadata')
    ids.add(o.id)
    return { id: o.id, label: o.label, available: o.status === 'ready' }
  })
  ids.clear()
  const assets: ManifestAsset[] = m.assets.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw Error('Invalid asset')
    const a = entry as Record<string, unknown>
    if (
      !isCharacterVisualState(a) ||
      !isOutfitId(a.outfitId) ||
      typeof a.id !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(a.id) ||
      ids.has(a.id) ||
      typeof a.file !== 'string' ||
      !/^koharu\/png\/[a-zA-Z0-9_-]+\.png$/.test(a.file) ||
      /_trial\.png$/.test(a.file) ||
      files.has(a.file)
    )
      throw Error('Invalid character asset')
    const key = `${a.outfitId}/${a.action}/${a.expression}`
    if (states.has(key) || !outfits.find((o) => o.id === a.outfitId)?.available)
      throw Error('Duplicate state or unprepared outfit asset')
    ids.add(a.id)
    files.add(a.file)
    states.add(key)
    return {
      id: a.id,
      file: a.file,
      outfitId: a.outfitId,
      action: a.action,
      expression: a.expression,
    }
  })
  if (!outfits.find((o) => o.id === 'default')?.available)
    throw Error('Default outfit required')
  for (const outfit of outfits)
    if (
      outfit.available &&
      !assets.some(
        (a) =>
          a.outfitId === outfit.id &&
          a.action === 'idle' &&
          a.expression === 'neutral',
      )
    )
      throw Error('Outfit neutral required')
  return { outfits, assets }
}
export function availableOutfit(
  value: unknown,
  options: readonly OutfitOption[],
): OutfitId {
  return options.find((o) => o.id === value && o.available)?.id ?? 'default'
}
