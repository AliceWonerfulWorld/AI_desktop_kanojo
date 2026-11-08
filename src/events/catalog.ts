import sample from './data/sample.json'
import { validateCatalog, type StoryEvent } from './event-schema'
const raw: unknown[] = [
  sample,
  {
    ...sample,
    id: 'tea-locked',
    title: 'もう少し仲良くなったら',
    condition: { minAffection: 70, requiredCompleted: [] },
  },
]
export const eventCatalog: readonly StoryEvent[] = (() => {
  try {
    return validateCatalog(raw)
  } catch (error) {
    console.error('Invalid event catalog', error)
    return []
  }
})()
