import manifest from '../../../../assets/character/manifest.json'
import neutral from '../../../../assets/character/koharu/png/koharu_normal_4K.png'
import shy from '../../../../assets/character/koharu/png/koharu_shy_4K.png'
import sleepy from '../../../../assets/character/koharu/png/koharu_sleeping_4K.png'
import surprised from '../../../../assets/character/koharu/png/koharu_suprising_4K.png'
import affectionate from '../../../../assets/character/koharu/png/standing_affectionate_4K.png'
import { isCharacterVisualState } from '../../../shared/character-state'
import type { CharacterAsset } from './asset-selection'

const urls: Record<string, string> = {
  'koharu/png/koharu_normal_4K.png': neutral,
  'koharu/png/koharu_shy_4K.png': shy,
  'koharu/png/koharu_sleeping_4K.png': sleepy,
  'koharu/png/koharu_suprising_4K.png': surprised,
  'koharu/png/standing_affectionate_4K.png': affectionate,
}

// Manifest is the source of state mapping and provenance; only explicitly bundled files can load.
export const characterAssets: readonly CharacterAsset[] = manifest.assets.map(
  (asset) => {
    if (!isCharacterVisualState(asset) || !urls[asset.file])
      throw new Error(`Invalid character manifest: ${asset.id}`)
    return {
      id: asset.id,
      url: urls[asset.file],
      action: asset.action,
      expression: asset.expression,
    }
  },
)
