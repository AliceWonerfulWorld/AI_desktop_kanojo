import { expressions, type Expression } from '../shared/character-state.ts'
export type Audience = 'general' | 'private'
export interface EventChoice {
  id: string
  text: string
  next: string
}
export interface StoryNode {
  id: string
  speaker: string
  text: string
  expression: Expression
  effect: 'none' | 'gentle'
  cgAssetId: string | null
  next: string | null
  choices: EventChoice[]
  end: boolean
}
export interface StoryEvent {
  id: string
  version: number
  title: string
  audience: Audience
  condition: { minAffection: number; requiredCompleted: string[] }
  entry: string
  nodes: StoryNode[]
}
export function isId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z][a-z0-9-]{0,63}$/.test(value) &&
    !['constructor', 'prototype'].includes(value)
  )
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Expected object')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number, empty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw Error('Invalid event text')
  return value
}
function id(value: unknown): string {
  if (!isId(value)) throw Error('Invalid ID')
  return value
}
export function validateEvent(value: unknown): StoryEvent {
  const e = object(value),
    c = object(e.condition)
  if (
    !Number.isSafeInteger(e.version) ||
    (e.version as number) < 1 ||
    !['general', 'private'].includes(e.audience as string) ||
    typeof c.minAffection !== 'number' ||
    !Number.isFinite(c.minAffection) ||
    c.minAffection < 0 ||
    c.minAffection > 100 ||
    !Array.isArray(c.requiredCompleted) ||
    c.requiredCompleted.length > 16 ||
    !Array.isArray(e.nodes) ||
    !e.nodes.length ||
    e.nodes.length > 128
  )
    throw Error('Invalid event fields')
  const nodes: StoryNode[] = e.nodes.map((value) => {
    const n = object(value)
    if (
      !expressions.includes(n.expression as Expression) ||
      !['none', 'gentle'].includes(n.effect as string) ||
      typeof n.end !== 'boolean' ||
      !Array.isArray(n.choices) ||
      n.choices.length > 8
    )
      throw Error('Invalid node fields')
    const choices = n.choices.map((value) => {
      const ch = object(value)
      return { id: id(ch.id), text: text(ch.text, 512), next: id(ch.next) }
    })
    if (new Set(choices.map((ch) => ch.id)).size !== choices.length)
      throw Error('Duplicate choice')
    const next = n.next === null ? null : id(n.next)
    if (
      n.end
        ? next !== null || choices.length !== 0
        : (next === null) === (choices.length === 0)
    )
      throw Error('Invalid node exit')
    return {
      id: id(n.id),
      speaker: text(n.speaker, 80, true),
      text: text(n.text, 8000),
      expression: n.expression as Expression,
      effect: n.effect as StoryNode['effect'],
      cgAssetId: n.cgAssetId === null ? null : id(n.cgAssetId),
      next,
      choices,
      end: n.end,
    }
  })
  const map = new Map(nodes.map((n) => [n.id, n]))
  if (map.size !== nodes.length || !map.has(id(e.entry)))
    throw Error('Duplicate/missing node')
  const visiting = new Set<string>(),
    visited = new Set<string>()
  function visit(key: string): void {
    if (visiting.has(key)) throw Error('Event cycle')
    if (visited.has(key)) return
    const n = map.get(key)
    if (!n) throw Error('Missing next node')
    visiting.add(key)
    for (const next of [
      ...(n.next ? [n.next] : []),
      ...n.choices.map((ch) => ch.next),
    ])
      visit(next)
    visiting.delete(key)
    visited.add(key)
  }
  visit(e.entry as string)
  if (visited.size !== nodes.length) throw Error('Unreachable node')
  return {
    id: id(e.id),
    version: e.version as number,
    title: text(e.title, 100),
    audience: e.audience as Audience,
    condition: {
      minAffection: c.minAffection,
      requiredCompleted: c.requiredCompleted.map(id),
    },
    entry: e.entry as string,
    nodes,
  }
}
export interface EventProgress {
  version: number
  node: string
  page: number
  visited: string[]
  choices: Record<string, string>
  completed: boolean
}
export type EventRecords = Record<string, EventProgress>
export function validateEventRecords(value: unknown): EventRecords {
  if (value === undefined) return {}
  const records = object(value),
    result: EventRecords = {}
  if (Object.keys(records).length > 32 || JSON.stringify(value).length > 32768)
    throw Error('Event save budget exceeded')
  for (const [key, value] of Object.entries(records)) {
    id(key)
    const p = object(value),
      choices = object(p.choices)
    if (
      !Number.isSafeInteger(p.version) ||
      (p.version as number) < 1 ||
      !Number.isSafeInteger(p.page) ||
      (p.page as number) < 0 ||
      (p.page as number) > 100 ||
      typeof p.completed !== 'boolean' ||
      !Array.isArray(p.visited) ||
      !p.visited.length ||
      p.visited.length > 128 ||
      Object.keys(choices).length > 128
    )
      throw Error('Invalid event checkpoint')
    result[key] = {
      version: p.version as number,
      node: id(p.node),
      page: p.page as number,
      completed: p.completed,
      visited: p.visited.map(id),
      choices: Object.fromEntries(
        Object.entries(choices).map(([node, choice]) => [id(node), id(choice)]),
      ),
    }
  }
  return result
}
export function isEventUnlocked(
  event: StoryEvent,
  affection: number,
  records: EventRecords,
): boolean {
  return (
    Number.isFinite(affection) &&
    affection >= event.condition.minAffection &&
    event.condition.requiredCompleted.every(
      (key) => records[key]?.completed === true,
    )
  )
}
export function pagesFor(text: string): string[] {
  const characters = Array.from(text),
    pages: string[] = []
  for (let i = 0; i < characters.length; i += 160)
    pages.push(characters.slice(i, i + 160).join(''))
  return pages.length ? pages : ['']
}
export function canResume(
  event: StoryEvent,
  progress: EventProgress | undefined,
): boolean {
  if (
    !progress ||
    progress.version !== event.version ||
    progress.visited[0] !== event.entry ||
    progress.visited.at(-1) !== progress.node ||
    new Set(progress.visited).size !== progress.visited.length
  )
    return false
  const map = new Map(event.nodes.map((n) => [n.id, n]))
  for (let i = 0; i < progress.visited.length; i++) {
    const node = map.get(progress.visited[i]!)
    if (!node) return false
    if (i + 1 < progress.visited.length) {
      const next =
        node.next ??
        node.choices.find((c) => c.id === progress.choices[node.id])?.next
      if (next !== progress.visited[i + 1]) return false
    }
  }
  return progress.page < pagesFor(map.get(progress.node)!.text).length
}

/** Validate the complete bundle before exposing its titles or accepting starts. */
export function validateCatalog(value: unknown): StoryEvent[] {
  if (!Array.isArray(value) || value.length > 32)
    throw Error('Invalid event catalog')
  const events = value.map(validateEvent),
    map = new Map(events.map((event) => [event.id, event]))
  if (map.size !== events.length) throw Error('Duplicate event ID')
  const active = new Set<string>(),
    done = new Set<string>()
  function visit(key: string): void {
    if (active.has(key)) throw Error('Unlock condition cycle')
    if (done.has(key)) return
    const event = map.get(key)
    if (!event) throw Error('Unknown required event')
    active.add(key)
    for (const required of event.condition.requiredCompleted) visit(required)
    active.delete(key)
    done.add(key)
  }
  for (const event of events) visit(event.id)
  return events
}
