import type { EventCommand, EventView } from '../../../shared/events-api'
import { PngCharacterRenderer } from '../character/png-renderer'
import { characterAssets } from '../character/assets'
import teaCard from '../../../../assets/events/tea-card.svg'
const images: Record<string, string> = { 'tea-card': teaCard }
export function mountEventView(
  root: HTMLElement,
  embedded = false,
): () => void {
  root.innerHTML = `<div class="event-tools"><button id="event-return" type="button">日常へ戻る</button><button id="event-hide" type="button">非表示</button><button id="event-list" type="button" hidden>イベントを選び直す</button><button id="event-resume" type="button" hidden>明示的に再開する</button></div><p id="event-warning" role="status" aria-live="polite"></p><section id="event-catalog" aria-label="イベント一覧"></section><section id="event-frame" class="event-layout" hidden><div id="event-visual"><div id="event-character"></div><img id="event-cg" alt="イベント用の仮画像" hidden/><p id="event-image-fallback" hidden>画像を表示できません。お話はこのまま続けられます。</p></div><div class="event-dialogue"><h2 id="event-title"></h2><h3 id="event-speaker"></h3><div id="event-text" tabindex="0" role="region" aria-label="会話本文"></div><p id="event-page"></p><button id="event-next" type="button">次へ →</button><p id="event-choice-label" hidden>選択してください</p><div id="event-choices"></div></div></section>`
  const get = <T extends HTMLElement>(id: string): T =>
    root.querySelector<T>(`#${id}`)!
  get('event-return').hidden = embedded
  get('event-hide').hidden = embedded
  let state: EventView | undefined,
    pending = false,
    disposed = false,
    png: PngCharacterRenderer | undefined,
    frameKey = ''
  let inputError = ''
  const warning = (): void => {
    get('event-warning').textContent = state?.saveFailed
      ? '保存できませんでした。再起動後は最後に保存できた位置からになります。非表示・終了は利用できます。'
      : inputError
        ? inputError
        : state?.paused
          ? '進行は一時停止中です。再開には明示操作が必要です。'
          : ''
  }
  const render = (next: EventView): void => {
    if (disposed || (state && next.revision < state.revision)) return
    const changed = !state || next.revision !== state.revision
    state = next
    warning()
    if (!changed) return
    root.dataset.phase = next.phase
    root.dataset.revision = String(next.revision)
    get('event-resume').hidden = embedded || !next.paused
    get<HTMLButtonElement>('event-resume').disabled = false
    get<HTMLButtonElement>('event-list').disabled = false
    get('event-list').hidden = next.phase !== 'playing'
    get('event-catalog').hidden = next.phase !== 'list'
    get('event-frame').hidden = next.phase !== 'playing'
    const catalog = get('event-catalog')
    catalog.replaceChildren()
    if (next.phase === 'list') {
      if (!next.events.length) {
        const p = document.createElement('p')
        p.textContent = '現在利用できるイベントはありません。'
        catalog.append(p)
      }
      for (const event of next.events) {
        const item = document.createElement('article'),
          title = document.createElement('h2'),
          label = document.createElement('p')
        title.textContent = event.title
        label.textContent = !event.unlocked
          ? '条件未達'
          : event.completed
            ? '完了済み'
            : '利用可能'
        item.append(title, label)
        for (const resume of [false, ...(event.resumable ? [true] : [])]) {
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = resume
            ? '続きから'
            : event.completed
              ? 'はじめから'
              : '開始'
          button.disabled = !event.unlocked || next.paused
          button.dataset.event = event.id
          button.dataset.resume = String(resume)
          button.addEventListener('click', () => {
            void send({ kind: 'start', eventId: event.id, resume })
          })
          item.append(button)
        }
        catalog.append(item)
      }
    }
    const frame = next.frame
    if (next.phase !== 'playing' || !frame) {
      png?.dispose()
      png = undefined
      frameKey = ''
      delete root.dataset.node
      delete root.dataset.page
      delete root.dataset.visualReady
      return
    }
    root.dataset.node = frame.nodeId
    root.dataset.page = String(frame.page)
    get('event-title').textContent = frame.title
    get('event-speaker').textContent = frame.speaker || '地の文'
    get('event-text').textContent = frame.text
    get('event-text').scrollTop = 0
    get('event-page').textContent = `${frame.page + 1} / ${frame.pageCount}`
    const button = get<HTMLButtonElement>('event-next')
    button.textContent = frame.end ? '完了して日常へ戻る' : '次へ →'
    button.disabled = next.paused || frame.choices.length > 0
    get('event-choice-label').hidden = !frame.choices.length
    const choices = get('event-choices')
    choices.replaceChildren()
    for (const choice of frame.choices) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = choice.text
      b.dataset.choice = choice.id
      b.disabled = next.paused
      b.addEventListener('click', () => {
        void send({ kind: 'choose', choiceId: choice.id })
      })
      choices.append(b)
    }
    const key = `${frame.eventId}:${frame.nodeId}:${next.outfitId ?? 'default'}`,
      image = get<HTMLImageElement>('event-cg'),
      fallback = get('event-image-fallback'),
      character = get('event-character')
    if (key !== frameKey) {
      root.dataset.visualReady = 'false'
      get('event-visual').className =
        frame.effect === 'gentle' ? 'event-gentle' : ''
      if (frame.cgAssetId) {
        png?.dispose()
        png = undefined
        character.hidden = true
        const url = images[frame.cgAssetId]
        image.hidden = !url
        fallback.hidden = !!url
        image.onerror = () => {
          if (disposed || frameKey !== key) return
          image.hidden = true
          fallback.hidden = false
          root.dataset.visualReady = 'true'
        }
        image.onload = () => {
          if (!disposed && frameKey === key) root.dataset.visualReady = 'true'
        }
        if (url) {
          image.src = url
          if (image.complete && image.naturalWidth > 0)
            root.dataset.visualReady = 'true'
        } else {
          image.removeAttribute('src')
          root.dataset.visualReady = 'true'
        }
      } else {
        image.hidden = true
        image.removeAttribute('src')
        fallback.hidden = true
        character.hidden = false
        png ??= new PngCharacterRenderer(character, characterAssets)
        void png
          .setState({
            action: 'idle',
            expression: frame.expression,
            outfitId: next.outfitId ?? 'default',
          })
          .then((result) => {
            if (!disposed && frameKey === key) {
              fallback.hidden = !!result.assetId
              root.dataset.visualReady = 'true'
            }
          })
      }
      frameKey = key
    }
    get('event-text').focus({ preventScroll: true })
  }
  type Intent =
    | { kind: 'start'; eventId: string; resume: boolean }
    | { kind: 'choose'; choiceId: string }
    | { kind: 'advance' | 'resume' | 'list' | 'return' | 'hide' }
  async function send(intent: Intent): Promise<void> {
    if (
      !state ||
      disposed ||
      (pending && intent.kind !== 'return' && intent.kind !== 'hide')
    )
      return
    pending = true
    inputError = ''
    // Disable before IPC; the revision also rejects duplicate native/keyboard events.
    for (const button of root.querySelectorAll<HTMLButtonElement>('button'))
      if (!['event-return', 'event-hide'].includes(button.id))
        button.disabled = true
    try {
      render(
        await window.events.command({
          ...intent,
          revision: state.revision,
        } as EventCommand),
      )
    } catch {
      inputError =
        '操作できませんでした。現在の画面を確認してもう一度お試しください。'
      warning()
      try {
        render(await window.events.getView())
      } catch {
        /* the window may have closed */
      }
    } finally {
      pending = false
      if (!disposed && state) {
        const current = state
        state = undefined
        render(current)
      }
    }
  }
  for (const [id, kind] of [
    ['event-return', 'return'],
    ['event-hide', 'hide'],
    ['event-list', 'list'],
    ['event-resume', 'resume'],
    ['event-next', 'advance'],
  ] as const)
    get(id).addEventListener('click', () => {
      void send({ kind })
    })
  const keydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.repeat) {
      event.preventDefault()
      event.stopPropagation()
      void send({ kind: 'return' })
    } else if (
      (event.key === 'Enter' || event.key === ' ') &&
      event.target === get('event-text')
    ) {
      event.preventDefault()
      if (!event.repeat && !get<HTMLButtonElement>('event-next').disabled)
        void send({ kind: 'advance' })
    }
  }
  root.addEventListener('keydown', keydown)
  const remove = window.events.onChange(render)
  void window.events
    .getView()
    .then(render)
    .catch(() => {
      get('event-warning').textContent =
        'イベント一覧を読み込めません。日常へ戻って開き直してください。'
    })
  return () => {
    disposed = true
    remove()
    png?.dispose()
    root.removeEventListener('keydown', keydown)
    root.replaceChildren()
  }
}
