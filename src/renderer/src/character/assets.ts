import { characterRegistry } from '../../../shared/outfit-registry'
import neutral from '../../../../assets/character/koharu/png/koharu_normal_4K.png'
import smile from '../../../../assets/character/koharu/png/standing_smile.png'
import shy from '../../../../assets/character/koharu/png/koharu_shy_4K.png'
import sleepy from '../../../../assets/character/koharu/png/koharu_sleeping_4K.png'
import surprised from '../../../../assets/character/koharu/png/koharu_suprising_4K.png'
import affectionate from '../../../../assets/character/koharu/png/standing_affectionate_4K.png'
import type { CharacterAsset } from './asset-selection'

const urls: Record<string, string> = {
  'koharu/png/koharu_normal_4K.png': neutral,
  'koharu/png/standing_smile.png': smile,
  'koharu/png/koharu_shy_4K.png': shy,
  'koharu/png/koharu_sleeping_4K.png': sleepy,
  'koharu/png/koharu_suprising_4K.png': surprised,
  'koharu/png/standing_affectionate_4K.png': affectionate,
}

// Additional URLs are registered only after the selected PNGs have been received.
export const characterAssets: readonly CharacterAsset[] =
  characterRegistry.assets.map((asset) => {
    if (!urls[asset.file])
      throw new Error(`Unbundled character asset: ${asset.id}`)
    return {
      id: asset.id,
      outfitId: asset.outfitId,
      url: urls[asset.file],
      action: asset.action,
      expression: asset.expression,
    }
  })
