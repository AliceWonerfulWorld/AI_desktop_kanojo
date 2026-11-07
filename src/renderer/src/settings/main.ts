import type {
  PresentationState,
  SettingsPatch,
} from '../../../shared/presentation'

const controls = document.querySelector<HTMLFieldSetElement>('#controls')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const scale = document.querySelector<HTMLInputElement>('#scale')!
const output = document.querySelector<HTMLOutputElement>('#scale-value')!
const visibility = document.querySelector<HTMLButtonElement>('#visibility')!
const fields = {
  alwaysOnTop: '#always-on-top',
  spontaneousDialogue: '#spontaneous',
  showOnStartup: '#show-on-startup',
  paused: '#paused',
} as const
let latest: PresentationState | undefined
let queue: Promise<void> = Promise.resolve()
let disposed = false
function render(state: PresentationState): void {
  if (disposed || (latest && state.revision < latest.revision)) return
  latest = state
  for (const [key, selector] of Object.entries(fields))
    document.querySelector<HTMLInputElement>(selector)!.checked =
      state.settings[key as keyof typeof fields]
  scale.value = String(state.settings.scale)
  output.value = `${Math.round(state.settings.scale * 100)}%`
  visibility.textContent = state.visible
    ? 'キャラクターを非表示'
    : 'キャラクターを表示'
}
function change(patch: SettingsPatch): void {
  queue = queue
    .then(async () => {
      status.textContent = '設定を反映しています…'
      render(await window.settings.update(patch))
      status.textContent = '設定を反映しました。自動で保存されます。'
    })
    .catch((error: unknown) => {
      console.error('Settings update failed', error)
      status.textContent =
        '設定を反映できませんでした。もう一度お試しください。'
    })
}
for (const [key, selector] of Object.entries(fields))
  document
    .querySelector<HTMLInputElement>(selector)!
    .addEventListener('change', (event) =>
      change({ [key]: (event.target as HTMLInputElement).checked }),
    )
scale.addEventListener('input', () => {
  output.value = `${Math.round(Number(scale.value) * 100)}%`
})
scale.addEventListener('change', () => change({ scale: Number(scale.value) }))
visibility.addEventListener('click', () => {
  queue = queue
    .then(async () => {
      render(await window.settings.setVisible(!latest?.visible))
    })
    .catch(() => {
      status.textContent = '表示を切り替えられませんでした。'
    })
})
document
  .querySelector('#close')!
  .addEventListener('click', () => window.close())
const remove = window.settings.onChange(render)
window.addEventListener('pagehide', () => {
  disposed = true
  remove()
})
void window.settings
  .getState()
  .then((state) => {
    render(state)
    controls.disabled = false
    status.textContent = '設定は自動で保存されます。'
  })
  .catch((error: unknown) => {
    console.error(error)
    status.textContent =
      '設定を読み込めませんでした。トレイから開き直してください。'
  })
