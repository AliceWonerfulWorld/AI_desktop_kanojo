import type { Action, Expression } from '../shared/character-state'
import type { RelationshipStage } from '../relationship/relationship'

export interface InteractionResponse {
  readonly id: string
  readonly text: string
  readonly expression: Expression
}

const familiar: Readonly<Record<Action, readonly InteractionResponse[]>> = {
  idle: [
    {
      id: 'familiar-idle-hello',
      text: 'あっ、来た！ お話したかったんだ。',
      expression: 'smile',
    },
    {
      id: 'familiar-idle-shy',
      text: 'えへへ、声をかけてもらうと嬉しいな。',
      expression: 'shy',
    },
    {
      id: 'familiar-idle-easy',
      text: '一緒だと、なんだかほっとするね。',
      expression: 'shy',
    },
  ],
  reading: [
    {
      id: 'familiar-reading-book',
      text: 'この本、あとで感想を話したいな！',
      expression: 'smile',
    },
    {
      id: 'familiar-reading-shy',
      text: 'えへへ、つい夢中になっちゃった。',
      expression: 'shy',
    },
    {
      id: 'familiar-reading-page',
      text: 'もう少し読んだら、一緒に休もっか。',
      expression: 'smile',
    },
  ],
  resting: [
    {
      id: 'familiar-resting-tea',
      text: 'お茶、もう一杯いれよっか！',
      expression: 'smile',
    },
    {
      id: 'familiar-resting-shy',
      text: 'こうして一息つく時間、好きだな。',
      expression: 'shy',
    },
    {
      id: 'familiar-resting-easy',
      text: 'えへへ、一緒にのんびりしよ。',
      expression: 'shy',
    },
  ],
  sleeping: [
    {
      id: 'familiar-sleeping-night',
      text: 'ん……おやすみ、またあとで……',
      expression: 'sleepy',
    },
    {
      id: 'familiar-sleeping-easy',
      text: 'すぅ……なんだか、安心する……',
      expression: 'sleepy',
    },
    {
      id: 'familiar-sleeping-more',
      text: 'むにゃ……お茶は、起きてからね……',
      expression: 'sleepy',
    },
  ],
}

const close: Readonly<Record<Action, readonly InteractionResponse[]>> = {
  idle: [
    {
      id: 'close-idle-together',
      text: 'えへへ、もう少し一緒にいてもいい？',
      expression: 'affectionate',
    },
    {
      id: 'close-idle-shy',
      text: '顔を見ると、つい嬉しくなっちゃう。',
      expression: 'shy',
    },
    {
      id: 'close-idle-hello',
      text: 'やっほー！ 隣、落ち着くんだ。',
      expression: 'affectionate',
    },
  ],
  reading: [
    {
      id: 'close-reading-together',
      text: 'このお話、一緒に読んでみない？',
      expression: 'affectionate',
    },
    {
      id: 'close-reading-shy',
      text: '隣で読んでると、なんだか嬉しいな。',
      expression: 'shy',
    },
    {
      id: 'close-reading-page',
      text: 'あと一ページだけ、一緒にのんびり。',
      expression: 'affectionate',
    },
  ],
  resting: [
    {
      id: 'close-resting-tea',
      text: 'えへへ、一緒のお茶は特別だね。',
      expression: 'affectionate',
    },
    {
      id: 'close-resting-shy',
      text: 'こうして隣にいられるの、嬉しいな。',
      expression: 'shy',
    },
    {
      id: 'close-resting-easy',
      text: 'もうちょっとだけ、くつろいでいこう？',
      expression: 'affectionate',
    },
  ],
  sleeping: [
    {
      id: 'close-sleeping-night',
      text: 'ん……一緒だと、よく眠れそう……',
      expression: 'sleepy',
    },
    {
      id: 'close-sleeping-easy',
      text: 'すぅ……あったかい気持ち……',
      expression: 'sleepy',
    },
    {
      id: 'close-sleeping-more',
      text: 'むにゃ……また一緒に、お茶しよ……',
      expression: 'sleepy',
    },
  ],
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
  stage: RelationshipStage = 'stranger',
): InteractionResponse {
  const pool = { stranger: responses, familiar, close }[stage]
  const candidates = pool[action].filter(
    (response) => response.id !== previousId,
  )
  const sample = random()
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
    throw new RangeError('Invalid response random sample')
  return Object.freeze({
    ...candidates[Math.floor(sample * candidates.length)]!,
  })
}
