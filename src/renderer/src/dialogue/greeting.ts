import type { TimePeriod } from '../../../behavior/time-policy'
import type { BehaviorClock } from '../../../behavior/behavior-engine'

const greetings: Readonly<Record<TimePeriod, string>> = {
  morning: 'おはよう！今日もよろしくね。',
  daytime: 'こんにちは！一緒にのんびりしよう。',
  evening: 'こんばんは！今日もお疲れさま。',
  'late-night': '遅い時間だね。ゆっくり休もうね。',
}
export function greetingFor(period: TimePeriod, firstLaunch: boolean): string {
  return `${firstLaunch ? 'はじめまして！' : ''}${greetings[period]}`
}

/** Passive, short-lived greeting. Not an interaction or a behavior-completion event. */
export class GreetingPresenter {
  private revision = 0
  private disposed = false
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
  show(text: string): void {
    if (this.disposed) return
    this.hide()
    const revision = this.revision
    this.view.textContent = text
    this.view.hidden = false
    this.cancel = this.clock.schedule(() => {
      if (revision === this.revision) this.hide()
    }, 5000)
  }
  hide(): void {
    this.revision++
    this.cancel?.()
    this.cancel = undefined
    this.view.hidden = true
    this.view.textContent = ''
  }
  dispose(): void {
    this.hide()
    this.disposed = true
  }
}
