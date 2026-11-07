import manifest from '../../../../assets/character/test/manifest.json'
import neutral from '../../../../assets/character/test/neutral.png'
import smile from '../../../../assets/character/test/smile.png'
import sleepy from '../../../../assets/character/test/sleepy.png'
import surprised from '../../../../assets/character/test/surprised.png'
import { isCharacterVisualState } from '../../../shared/character-state'
import type { CharacterAsset } from './asset-selection'

const urls: Record<string, string> = {
  'test/neutral.png': neutral,
  'test/smile.png': smile,
  'test/sleepy.png': sleepy,
  'test/surprised.png': surprised,
}

// Manifest is the source of state mapping and provenance; only explicitly bundled files can load.
export const testCharacterAssets: readonly CharacterAsset[] =
  manifest.assets.map((asset) => {
    if (!isCharacterVisualState(asset) || !urls[asset.file])
      throw new Error(`Invalid character manifest: ${asset.id}`)
    return {
      id: asset.id,
      url: urls[asset.file],
      action: asset.action,
      expression: asset.expression,
    }
  })
