import { timeContextAt } from '../../../behavior/time-policy.ts'

export interface LocalTimeSource {
  now(): Date
}
/** Development-only virtual local time. Never changes the OS clock or elapsed-time clock. */
export function installTimePreview(
  source: LocalTimeSource,
  changed: () => void,
): () => void {
  const liveNow = source.now
  Object.defineProperty(window, 'timePreview', {
    configurable: true,
    value: Object.freeze({
      setLocalTime(value: string) {
        if (typeof value !== 'string')
          throw new TypeError('Expected an ISO date-time string')
        const date = new Date(value)
        timeContextAt(date)
        source.now = () => new Date(date.getTime())
        changed()
      },
      reset() {
        source.now = liveNow
        changed()
      },
      getState: () => ({
        localTime: source.now().toString(),
        ...timeContextAt(source.now()),
      }),
    }),
  })
  return () => {
    source.now = liveNow
    Reflect.deleteProperty(window, 'timePreview')
  }
}
