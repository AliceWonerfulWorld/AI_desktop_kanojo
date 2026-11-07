import type { Action, Expression } from '../shared/character-state'

export interface InteractionResponse {
  readonly id: string
  readonly text: string
  readonly expression: Expression
}
const responses: Readonly<Record<Action, readonly InteractionResponse[]>> = {
  idle: [
    { id: 'idle-hello', text: 'やっほー！', expression: 'smile' },
    {
      id: 'idle-curious',
      text: 'んー、今日は何しよっかな？',
      expression: 'surprised',
    },
    {
      id: 'idle-break',
      text: 'えへへ、ちょっとひと休み？',
      expression: 'smile',
    },
  ],
  reading: [
    {
      id: 'reading-page',
      text: '今、いいところなんだ。あとでお話しよ！',
      expression: 'smile',
    },
    {
      id: 'reading-book',
      text: 'この本、おもしろいんだよ！',
      expression: 'smile',
    },
    {
      id: 'reading-more',
      text: 'あと少しだけ、読んでもいい？',
      expression: 'neutral',
    },
  ],
  resting: [
    { id: 'resting-break', text: 'ふぅ〜、休憩しよっ！', expression: 'smile' },
    { id: 'resting-tea', text: 'お茶の時間にしよっか。', expression: 'smile' },
    {
      id: 'resting-easy',
      text: 'のんびりするのもいいよね。',
      expression: 'neutral',
    },
  ],
  sleeping: [
    { id: 'sleeping-night', text: 'んん……おやすみ……', expression: 'sleepy' },
    {
      id: 'sleeping-more',
      text: 'すぅ……もうちょっとだけ……',
      expression: 'sleepy',
    },
    {
      id: 'sleeping-later',
      text: 'むにゃ……またあとでね……',
      expression: 'sleepy',
    },
  ],
}

export function chooseResponse(
  action: Action,
  random: () => number,
  previousId?: string,
): InteractionResponse {
  const candidates = responses[action].filter(
    (response) => response.id !== previousId,
  )
  const sample = random()
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
    throw new RangeError('Invalid response random sample')
  return Object.freeze({
    ...candidates[Math.floor(sample * candidates.length)]!,
  })
}
