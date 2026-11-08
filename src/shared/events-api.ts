import type { OutfitId } from './outfits'
import type { Audience, StoryNode } from '../events/event-schema'
export interface EventSummary {
  id: string
  title: string
  unlocked: boolean
  resumable: boolean
  completed: boolean
}
export interface EventFrame {
  eventId: string
  nodeId: string
  title: string
  speaker: string
  text: string
  page: number
  pageCount: number
  expression: StoryNode['expression']
  effect: StoryNode['effect']
  cgAssetId: string | null
  choices: { id: string; text: string }[]
  end: boolean
}
export interface EventView {
  outfitId?: OutfitId
  revision: number
  phase: 'closed' | 'list' | 'playing' | 'completed'
  audience: Audience
  paused: boolean
  saveFailed: boolean
  events: EventSummary[]
  frame: EventFrame | null
}
export type EventCommand =
  | { kind: 'start'; revision: number; eventId: string; resume: boolean }
  | {
      kind: 'advance' | 'resume' | 'list' | 'return' | 'hide'
      revision: number
    }
  | { kind: 'choose'; revision: number; choiceId: string }
export interface EventsAPI {
  getView(): Promise<EventView>
  command(command: EventCommand): Promise<EventView>
  onChange(listener: (view: EventView) => void): () => void
}
