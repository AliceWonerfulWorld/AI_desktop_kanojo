import { actions, type Action } from '../shared/character-state.ts'

export interface BehaviorClock {
  /** Monotonic milliseconds; unrelated to local time of day. */
  now(): number
  /** Schedules once, asynchronously. Returns an idempotent cancellation function. */
  schedule(callback: () => void, delayMs: number): () => void
}

export interface ActionRule {
  readonly durationMs: readonly [number, number]
  readonly weight: number
}
export type BehaviorRules = Readonly<Record<Action, ActionRule>>
export const defaultBehaviorRules: BehaviorRules = {
  idle: { durationMs: [20_000, 60_000], weight: 35 },
  reading: { durationMs: [60_000, 180_000], weight: 25 },
  resting: { durationMs: [30_000, 120_000], weight: 30 },
  sleeping: { durationMs: [120_000, 300_000], weight: 10 },
}

export interface ActiveBehavior {
  readonly action: Action
  readonly sequence: number
  readonly startedAtMs: number
  readonly durationMs: number
  readonly deadlineMs: number
}
export interface BehaviorSnapshot {
  readonly status: 'stopped' | 'running' | 'paused' | 'disposed'
  readonly current: ActiveBehavior | null
  readonly remainingMs: number
}
export interface BehaviorEvent {
  readonly reason: 'started' | 'transition' | 'paused' | 'resumed' | 'stopped'
  readonly previous: Action | null
  readonly snapshot: BehaviorSnapshot
}
export interface BehaviorOptions {
  readonly clock: BehaviorClock
  readonly random?: () => number
  readonly rules?: BehaviorRules
  readonly onError?: (error: unknown) => void
}

/** No DOM, Electron, concrete dialogue, image paths, or animation implementation. */
export class BehaviorEngine {
  private readonly clock: BehaviorClock
  private readonly random: () => number
  private readonly rules: BehaviorRules
  private readonly onError: (error: unknown) => void
  private readonly listeners = new Set<(event: BehaviorEvent) => void>()
  private status: BehaviorSnapshot['status'] = 'stopped'
  private current: ActiveBehavior | null = null
  private remaining = 0
  private cancel: (() => void) | undefined
  private generation = 0
  private sequence = 0

  constructor(options: BehaviorOptions) {
    this.clock = options.clock
    this.random = options.random ?? Math.random
    this.onError = options.onError ?? console.error
    const rules = options.rules ?? defaultBehaviorRules
    this.rules = Object.fromEntries(
      actions.map((action) => {
        const {
          durationMs: [min, max],
          weight,
        } = rules[action]
        if (
          !Number.isFinite(min) ||
          !Number.isFinite(max) ||
          min <= 0 ||
          max < min ||
          max > 2_147_483_647 ||
          !Number.isFinite(weight) ||
          weight < 0
        ) {
          throw new RangeError(`Invalid behavior rule: ${action}`)
        }
        return [action, { durationMs: [min, max], weight }]
      }),
    ) as unknown as BehaviorRules
    if (actions.filter((action) => this.rules[action].weight > 0).length < 2) {
      throw new RangeError(
        'At least two actions need positive weight to avoid repeats',
      )
    }
  }

  subscribe(listener: (event: BehaviorEvent) => void): () => void {
    if (this.status === 'disposed')
      throw new Error('BehaviorEngine is disposed')
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): BehaviorSnapshot {
    return Object.freeze({
      status: this.status,
      current: this.current,
      remainingMs:
        this.status === 'running' && this.current
          ? Math.max(0, this.current.deadlineMs - this.clock.now())
          : this.remaining,
    })
  }

  start(): void {
    if (this.status === 'disposed')
      throw new Error('BehaviorEngine is disposed')
    if (this.status !== 'stopped') return
    this.enter('idle', 'started')
  }

  pause(): void {
    if (this.status !== 'running') return
    this.remaining = this.getSnapshot().remainingMs
    this.clearTimer()
    this.status = 'paused'
    this.emit('paused', this.current?.action ?? null)
  }

  resume(): void {
    if (this.status !== 'paused' || !this.current) return
    this.current = Object.freeze({
      ...this.current,
      deadlineMs: this.clock.now() + this.remaining,
    })
    this.status = 'running'
    this.arm()
    this.emit('resumed', this.current.action)
  }

  stop(): void {
    if (this.status === 'stopped' || this.status === 'disposed') return
    const previous = this.current?.action ?? null
    this.clearTimer()
    this.status = 'stopped'
    this.current = null
    this.remaining = 0
    this.emit('stopped', previous)
  }

  dispose(): void {
    this.clearTimer()
    this.status = 'disposed'
    this.current = null
    this.remaining = 0
    this.listeners.clear()
  }

  private sample(): number {
    const value = this.random()
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new RangeError('Random sample must be in [0, 1)')
    return value
  }

  private nextAction(previous: Action): Action {
    const candidates = actions.filter(
      (action) => action !== previous && this.rules[action].weight > 0,
    )
    const total = candidates.reduce(
      (sum, action) => sum + this.rules[action].weight,
      0,
    )
    let value = this.sample() * total
    for (const action of candidates) {
      value -= this.rules[action].weight
      if (value < 0) return action
    }
    return candidates[candidates.length - 1]!
  }

  private enter(action: Action, reason: 'started' | 'transition'): void {
    const [min, max] = this.rules[action].durationMs
    const durationMs = min + this.sample() * (max - min)
    const now = this.clock.now()
    const previous = this.current?.action ?? null
    this.clearTimer()
    this.current = Object.freeze({
      action,
      sequence: ++this.sequence,
      startedAtMs: now,
      durationMs,
      deadlineMs: now + durationMs,
    })
    this.remaining = durationMs
    this.status = 'running'
    // Arm before notification so stop/pause/dispose from a listener can cancel it.
    this.arm()
    this.emit(reason, previous)
  }

  private clearTimer(): void {
    this.generation++
    this.cancel?.()
    this.cancel = undefined
  }

  private arm(): void {
    this.clearTimer()
    const generation = this.generation
    this.cancel = this.clock.schedule(() => {
      if (
        generation !== this.generation ||
        this.status !== 'running' ||
        !this.current
      )
        return
      this.cancel = undefined
      if (this.clock.now() < this.current.deadlineMs) {
        this.arm()
        return
      }
      try {
        // A late callback advances once from now; never replay a burst of missed actions.
        this.enter(this.nextAction(this.current.action), 'transition')
      } catch (error) {
        this.stop()
        this.report(error)
      }
    }, this.getSnapshot().remainingMs)
  }

  private emit(reason: BehaviorEvent['reason'], previous: Action | null): void {
    const generation = this.generation
    const event = Object.freeze({
      reason,
      previous,
      snapshot: this.getSnapshot(),
    })
    for (const listener of [...this.listeners]) {
      if (generation !== this.generation) break
      try {
        listener(event)
      } catch (error) {
        this.report(error)
      }
    }
  }

  private report(error: unknown): void {
    try {
      this.onError(error)
    } catch {
      /* Consumer errors must not corrupt scheduling. */
    }
  }
}
