import type { TimePeriod } from '../../../behavior/time-policy'
import type { BehaviorClock } from '../../../behavior/behavior-engine'
import type { RelationshipStage } from '../../../relationship/relationship'

const greetings: Readonly<Record<TimePeriod, string>> = {
  morning: 'おはよう！今日もよろしくね。',
  daytime: 'こんにちは！一緒にのんびりしよう。',
  evening: 'こんばんは！今日もお疲れさま。',
  'late-night': '遅い時間だね。ゆっくり休もうね。',
}
const relationshipGreetings: Record<
  Exclude<RelationshipStage, 'stranger'>,
  Record<TimePeriod, string>
> = {
  familiar: {
    morning: 'おはよう！ 顔を見られて嬉しいな。',
    daytime: 'やっほー！ 今日も一緒にのんびりしよ。',
    evening: 'こんばんは！ 一緒にひと休みしよっか。',
    'late-night': '夜更かしだね。ゆっくり休んでね。',
  },
  close: {
    morning: 'おはよう！ えへへ、一緒の朝だね。',
    daytime: 'やっほー！ 隣でくつろいでもいい？',
    evening: 'こんばんは。こうして一緒にいられるの、嬉しいな。',
    'late-night': 'おやすみ。あったかくして休もうね。',
  },
}
export function greetingFor(
  period: TimePeriod,
  firstLaunch: boolean,
  stage: RelationshipStage = 'stranger',
): string {
  const text =
    stage === 'stranger'
      ? greetings[period]
      : relationshipGreetings[stage][period]
  return `${firstLaunch ? 'はじめまして！' : ''}${text}`
}

/** Passive, short-lived greeting. Not an interaction or a behavior-completion event. */
export class GreetingPresenter {
  private revision = 0
  private disposed = false
  private priority: 'passive' | 'interaction' | undefined
  private cancel: (() => void) | undefined
  private readonly view: Pick<HTMLElement, 'hidden' | 'textContent'>
  private readonly clock: BehaviorClock
  constructor(
    view: Pick<HTMLElement, 'hidden' | 'textContent'>,
    clock: BehaviorClock,
  ) {
    this.view = view
    this.clock = clock
  }
  show(
    text: string,
    durationMs = 5000,
    priority: 'passive' | 'interaction' = 'passive',
  ): boolean {
    if (
      this.disposed ||
      (priority === 'passive' && this.priority === 'interaction')
    )
      return false
    this.hide()
    this.priority = priority
    const revision = this.revision
    this.view.textContent = text
    this.view.hidden = false
    this.cancel = this.clock.schedule(() => {
      if (revision === this.revision) this.hide()
    }, durationMs)
    return true
  }
  hide(): void {
    this.revision++
    this.cancel?.()
    this.cancel = undefined
    this.priority = undefined
    this.view.hidden = true
    this.view.textContent = ''
  }
  hidePassive(): void {
    if (this.priority === 'passive') this.hide()
  }
  dispose(): void {
    this.hide()
    this.disposed = true
  }
}
