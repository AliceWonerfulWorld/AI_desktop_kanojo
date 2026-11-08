import sample from './data/sample.json'
import { validateEvent, type StoryEvent } from './event-schema'
const raw: unknown[] = [
  sample,
  {
    ...sample,
    id: 'tea-locked',
    title: 'もう少し仲良くなったら（解放条件確認）',
    condition: { minAffection: 70, requiredCompleted: [] },
  },
]
export const eventCatalog: readonly StoryEvent[] = raw.flatMap((value) => {
  try {
    return [validateEvent(value)]
  } catch (error) {
    console.error('Invalid event definition', error)
    return []
  }
})
