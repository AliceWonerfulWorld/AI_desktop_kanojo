import { actions, type Action } from './character-state.ts'
import {
  relationshipStage,
  type RelationshipStage,
} from '../relationship/relationship.ts'

export interface MemoryState {
  schemaVersion: 1
  affection: number
  relationshipStage: RelationshipStage
  lastLaunchedAt: string | null
  totalActiveMs: number
  interactionCount: number
  lastAction: Action | null
  affectionCooldownMs: number
  interactionCooldownMs: number
  settings: {
    alwaysOnTop: boolean
    clickThrough: boolean
    scale: number
    spontaneousDialogue: boolean
    windowBounds: { x: number; y: number; width: number; height: number } | null
  }
}

export function defaultMemory(): MemoryState {
  return {
    schemaVersion: 1,
    affection: 0,
    relationshipStage: 'stranger',
    lastLaunchedAt: null,
    totalActiveMs: 0,
    interactionCount: 0,
    lastAction: null,
    affectionCooldownMs: 0,
    interactionCooldownMs: 0,
    settings: {
      alwaysOnTop: true,
      clickThrough: true,
      scale: 1,
      spontaneousDialogue: true,
      windowBounds: null,
    },
  }
}

export function validateMemory(value: unknown): MemoryState {
  if (!value || typeof value !== 'object') throw new Error('Invalid save')
  const s = value as MemoryState
  const number = (n: unknown, min: number, max: number): boolean =>
    typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
  if (s.schemaVersion !== 1) throw new Error('Unsupported save version')
  if (
    relationshipStage(s.affection) !== s.relationshipStage ||
    !number(s.totalActiveMs, 0, Number.MAX_SAFE_INTEGER) ||
    !Number.isSafeInteger(s.interactionCount) ||
    s.interactionCount < 0 ||
    !number(s.affectionCooldownMs, 0, 60000) ||
    !number(s.interactionCooldownMs, 0, 15000) ||
    (s.lastAction !== null && !actions.includes(s.lastAction)) ||
    (s.lastLaunchedAt !== null &&
      (typeof s.lastLaunchedAt !== 'string' ||
        !Number.isFinite(Date.parse(s.lastLaunchedAt)))) ||
    !s.settings ||
    typeof s.settings.alwaysOnTop !== 'boolean' ||
    typeof s.settings.clickThrough !== 'boolean' ||
    typeof s.settings.spontaneousDialogue !== 'boolean' ||
    !number(s.settings.scale, 0.5, 2)
  )
    throw new Error('Invalid save fields')
  const b = s.settings.windowBounds
  if (
    b !== null &&
    (!b ||
      !number(b.x, -100000, 100000) ||
      !number(b.y, -100000, 100000) ||
      !number(b.width, 80, 3000) ||
      !number(b.height, 80, 3000))
  )
    throw new Error('Invalid window bounds')
  // Reconstruct known fields so unrecognized data is never passed through IPC or saved.
  return {
    schemaVersion: 1,
    affection: s.affection,
    relationshipStage: s.relationshipStage,
    lastLaunchedAt: s.lastLaunchedAt,
    totalActiveMs: s.totalActiveMs,
    interactionCount: s.interactionCount,
    lastAction: s.lastAction,
    affectionCooldownMs: s.affectionCooldownMs,
    interactionCooldownMs: s.interactionCooldownMs,
    settings: {
      alwaysOnTop: s.settings.alwaysOnTop,
      clickThrough: s.settings.clickThrough,
      scale: s.settings.scale,
      spontaneousDialogue: s.settings.spontaneousDialogue,
      windowBounds: b
        ? { x: b.x, y: b.y, width: b.width, height: b.height }
        : null,
    },
  }
}
