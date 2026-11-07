export type RelationshipStage = 'stranger' | 'familiar' | 'close'

export interface RelationshipSnapshot {
  readonly affection: number
  readonly stage: RelationshipStage
}

export function relationshipStage(affection: number): RelationshipStage {
  if (!Number.isInteger(affection) || affection < 0 || affection > 100)
    throw new RangeError('Affection must be an integer from 0 to 100')
  return affection >= 70 ? 'close' : affection >= 30 ? 'familiar' : 'stranger'
}

/** Session state only; persistence belongs to the memory layer (MVP-08). */
export class RelationshipModel {
  private affection: number
  private nextGainAt = -Infinity
  private readonly now: () => number

  constructor(now: () => number, initialAffection = 0) {
    relationshipStage(initialAffection)
    this.affection = initialAffection
    this.now = now
  }
  getSnapshot(): RelationshipSnapshot {
    return Object.freeze({
      affection: this.affection,
      stage: relationshipStage(this.affection),
    })
  }
  /** Call only after an interaction is accepted. No timers, decay or catch-up gains. */
  recordInteraction(): RelationshipSnapshot {
    const now = this.now()
    if (!Number.isFinite(now)) throw new RangeError('Invalid monotonic time')
    if (now >= this.nextGainAt) {
      this.affection = Math.min(100, this.affection + 1)
      this.nextGainAt = now + 60000
    }
    return this.getSnapshot()
  }
}
