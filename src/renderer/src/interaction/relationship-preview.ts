import type { RelationshipSnapshot } from '../../../relationship/relationship'

/** Loaded only in development; numeric relationship data never enters normal UI. */
export function installRelationshipPreview(
  getState: () => RelationshipSnapshot,
  setAffection: (value: number) => RelationshipSnapshot,
  showGreeting: () => void,
): () => void {
  Object.defineProperty(window, 'relationshipPreview', {
    configurable: true,
    value: Object.freeze({ getState, setAffection, showGreeting }),
  })
  return () => {
    Reflect.deleteProperty(window, 'relationshipPreview')
  }
}
