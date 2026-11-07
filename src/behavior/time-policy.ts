import type { Action } from '../shared/character-state'
import type { BehaviorSelectionPolicy } from './behavior-engine'

export type TimePeriod = 'morning' | 'daytime' | 'evening' | 'late-night'
export interface TimeContext extends BehaviorSelectionPolicy {
  readonly period: TimePeriod
}

const weights: Readonly<Record<TimePeriod, Readonly<Record<Action, number>>>> =
  Object.freeze({
    morning: Object.freeze({
      idle: 35,
      reading: 25,
      resting: 30,
      sleeping: 10,
    }),
    daytime: Object.freeze({ idle: 25, reading: 40, resting: 30, sleeping: 5 }),
    evening: Object.freeze({
      idle: 30,
      reading: 25,
      resting: 30,
      sleeping: 15,
    }),
    'late-night': Object.freeze({
      idle: 10,
      reading: 5,
      resting: 15,
      sleeping: 70,
    }),
  })

/** Date uses the device's local timezone; invalid injected dates fail before changing state. */
export function timeContextAt(date: Date): TimeContext {
  if (!Number.isFinite(date.getTime()))
    throw new RangeError('Invalid local time')
  const hour = date.getHours()
  const period: TimePeriod =
    hour >= 6 && hour < 11
      ? 'morning'
      : hour >= 11 && hour < 18
        ? 'daytime'
        : hour >= 18 && hour < 23
          ? 'evening'
          : 'late-night'
  return Object.freeze({
    period,
    weights: weights[period],
    allowSleepingRepeat: period === 'late-night',
  })
}
