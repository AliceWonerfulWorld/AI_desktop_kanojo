import {
  canResume,
  isEventUnlocked,
  isId,
  pagesFor,
  type Audience,
  type EventProgress,
  type EventRecords,
  type StoryEvent,
} from './event-schema.ts'
import type { EventCommand, EventView } from '../shared/events-api.ts'
export class EventPlayer {
  private revision = 0
  private phase: EventView['phase'] = 'closed'
  private audience: Audience = 'general'
  private paused = false
  private current: { event: StoryEvent; progress: EventProgress } | undefined
  private readonly catalog: readonly StoryEvent[]
  private readonly memory: () => { affection: number; events: EventRecords }
  private readonly checkpoint: (id: string, progress: EventProgress) => void
  constructor(
    catalog: readonly StoryEvent[],
    memory: () => { affection: number; events: EventRecords },
    checkpoint: (id: string, progress: EventProgress) => void,
  ) {
    this.catalog = catalog
    this.memory = memory
    this.checkpoint = checkpoint
  }
  open(audience: Audience): void {
    this.close()
    this.audience = audience
    this.phase = 'list'
  }
  close(): void {
    this.revision++
    this.phase = 'closed'
    this.paused = false
    this.current = undefined
  }
  pause(): void {
    if (this.phase !== 'closed') {
      this.revision++
      this.paused = true
    }
  }
  resume(): void {
    if (this.phase !== 'closed') {
      this.revision++
      this.paused = false
    }
  }
  view(saveFailed = false): EventView {
    const memory = this.memory(),
      p = this.current?.progress,
      event = this.current?.event
    const node = event?.nodes.find((n) => n.id === p?.node),
      pages = node ? pagesFor(node.text) : []
    const last = !!p && p.page === pages.length - 1
    return {
      revision: this.revision,
      phase: this.phase,
      audience: this.audience,
      paused: this.paused,
      saveFailed,
      events:
        this.phase === 'closed'
          ? []
          : this.catalog
              .filter((e) => e.audience === this.audience)
              .map((e) => ({
                id: e.id,
                title: e.title,
                unlocked: isEventUnlocked(e, memory.affection, memory.events),
                resumable: canResume(e, memory.events[e.id]),
                completed: memory.events[e.id]?.completed === true,
              })),
      frame:
        node && event && p
          ? {
              eventId: event.id,
              nodeId: node.id,
              title: event.title,
              speaker: node.speaker,
              text: pages[p.page]!,
              page: p.page,
              pageCount: pages.length,
              expression: node.expression,
              effect: node.effect,
              cgAssetId: node.cgAssetId,
              choices: last
                ? node.choices.map(({ id, text }) => ({ id, text }))
                : [],
              end: last && node.end,
            }
          : null,
    }
  }
  apply(command: EventCommand): void {
    if (command.revision !== this.revision || this.phase === 'closed')
      throw Error('Stale event command')
    if (command.kind === 'resume') {
      this.resume()
      return
    }
    if (command.kind === 'list') {
      this.revision++
      this.phase = 'list'
      this.current = undefined
      return
    }
    if (this.paused) throw Error('Event paused')
    if (command.kind === 'start') {
      if (this.phase !== 'list') throw Error('Already playing')
      const event = this.catalog.find((e) => e.id === command.eventId),
        memory = this.memory()
      if (
        !event ||
        event.audience !== this.audience ||
        !isEventUnlocked(event, memory.affection, memory.events)
      )
        throw Error('Event unavailable')
      const old = memory.events[event.id]
      if (command.resume && !canResume(event, old))
        throw Error('Invalid checkpoint')
      const progress: EventProgress = command.resume
        ? structuredClone(old!)
        : {
            version: event.version,
            node: event.entry,
            page: 0,
            visited: [event.entry],
            choices: {},
            completed: old?.completed === true,
          }
      this.commit(event, progress)
      return
    }
    if (this.phase !== 'playing' || !this.current) throw Error('Not playing')
    const { event } = this.current,
      progress = structuredClone(this.current.progress),
      node = event.nodes.find((n) => n.id === progress.node)!
    const pages = pagesFor(node.text)
    if (progress.page < pages.length - 1) {
      if (command.kind !== 'advance') throw Error('Unread page')
      progress.page++
    } else if (command.kind === 'choose') {
      const choice = node.choices.find((c) => c.id === command.choiceId)
      if (!choice) throw Error('Invalid choice')
      progress.choices[node.id] = choice.id
      progress.node = choice.next
      progress.page = 0
      progress.visited.push(choice.next)
    } else if (command.kind === 'advance' && !node.choices.length) {
      if (node.end) {
        progress.completed = true
        this.commit(event, progress)
        this.phase = 'completed'
        return
      }
      progress.node = node.next!
      progress.page = 0
      progress.visited.push(node.next!)
    } else throw Error('Choice required')
    this.commit(event, progress)
  }
  private commit(event: StoryEvent, progress: EventProgress): void {
    this.checkpoint(event.id, progress)
    this.current = { event, progress }
    this.phase = 'playing'
    this.revision++
  }
}
export function isEventCommand(value: unknown): value is EventCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!Number.isSafeInteger(v.revision) || (v.revision as number) < 0)
    return false
  const keys =
    v.kind === 'start'
      ? ['kind', 'revision', 'eventId', 'resume']
      : v.kind === 'choose'
        ? ['kind', 'revision', 'choiceId']
        : ['kind', 'revision']
  if (
    Object.keys(v).length !== keys.length ||
    !Object.keys(v).every((k) => keys.includes(k))
  )
    return false
  if (v.kind === 'start')
    return isId(v.eventId) && typeof v.resume === 'boolean'
  if (v.kind === 'choose') return isId(v.choiceId)
  return ['advance', 'resume', 'list', 'return', 'hide'].includes(
    v.kind as string,
  )
}
