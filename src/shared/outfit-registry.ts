import manifest from '../../assets/character/manifest.json'
import { validateCharacterManifest } from './character-manifest'
export const characterRegistry = validateCharacterManifest(manifest)
