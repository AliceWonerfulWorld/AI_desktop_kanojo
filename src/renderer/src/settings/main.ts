import { isOutfitId } from '../../../shared/outfits'
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
  privateHideOnBlur: '#private-hide-on-blur',
} as const
const outfitSelect =
  document.querySelector<HTMLSelectElement>('#outfit-select')!
const outfitApply = document.querySelector<HTMLButtonElement>('#outfit-apply')!
const outfitStatus =
  document.querySelector<HTMLParagraphElement>('#outfit-status')!
let outfitBusy = false
let outfitBuilt = false
let latest: PresentationState | undefined
function updateOutfitButton(): void {
  outfitApply.disabled =
    outfitBusy ||
    !latest ||
    outfitSelect.value === latest.settings.outfitId ||
    !latest.outfits.some((o) => o.id === outfitSelect.value && o.available)
}

let queue: Promise<void> = Promise.resolve()
let disposed = false
function render(state: PresentationState): void {
  if (disposed || (latest && state.revision < latest.revision)) return
  const previousOutfit = latest?.settings.outfitId
  latest = state
  if (!outfitBuilt) {
    for (const outfit of state.outfits) {
      const option = document.createElement('option')
      option.value = outfit.id
      option.textContent =
        outfit.label + (outfit.available ? '' : '（素材準備中）')
      option.disabled = !outfit.available
      outfitSelect.append(option)
    }
    outfitBuilt = true
  }
  if (previousOutfit !== state.settings.outfitId)
    outfitSelect.value = state.settings.outfitId
  outfitSelect.disabled = outfitBusy || !!state.outfitRequest
  if (state.outfitRequest) {
    outfitStatus.dataset.phase = 'loading'
    outfitStatus.textContent = '衣装の画像を読み込んでいます…'
  } else if (!outfitBusy && !previousOutfit) {
    outfitStatus.dataset.phase = 'ready'
    outfitStatus.textContent = state.outfits.some((o) => !o.available)
      ? '部屋着は素材準備中です。選択しただけでは衣装は変わりません。'
      : '選択後に「この衣装を適用」を押してください。'
  }
  updateOutfitButton()
  if (state.saveFailed)
    status.textContent =
      '保存できませんでした。直近の変更は再起動後に復元できない可能性があります。'
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
      if (!latest?.saveFailed)
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

document.querySelector('#private-open')!.addEventListener('click', () => {
  queue = queue
    .then(() => window.settings.openPrivateMode())
    .catch(() => {
      status.textContent = '開けませんでした。もう一度お試しください。'
    })
})

document.querySelector('#event-open')!.addEventListener('click', () => {
  queue = queue
    .then(() => window.settings.openEvents())
    .catch(() => {
      status.textContent = '開けませんでした。もう一度お試しください。'
    })
})

outfitSelect.addEventListener('change', () => {
  outfitStatus.dataset.phase = 'candidate'
  outfitStatus.textContent =
    'まだ変更していません。「この衣装を適用」で反映します。'
  updateOutfitButton()
})
outfitApply.addEventListener('click', () => {
  const id = outfitSelect.value
  if (outfitApply.disabled || !isOutfitId(id)) return
  outfitBusy = true
  outfitSelect.disabled = true
  updateOutfitButton()
  outfitStatus.dataset.phase = 'applying'
  outfitStatus.textContent = '衣装を適用しています…'
  queue = queue
    .then(async () => {
      render(await window.settings.applyOutfit(id))
      outfitStatus.dataset.phase = 'applied'
      outfitStatus.textContent = latest?.saveFailed
        ? '衣装は反映しましたが、保存できませんでした。'
        : '衣装を反映しました。自動で保存されます。'
    })
    .catch(() => {
      outfitStatus.dataset.phase = 'failed'
      outfitStatus.textContent =
        '衣装を読み込めませんでした。以前の衣装を維持しています。再度お試しください。'
      if (latest) outfitSelect.value = latest.settings.outfitId
    })
    .finally(() => {
      if (disposed) return
      outfitBusy = false
      outfitSelect.disabled = false
      updateOutfitButton()
    })
})
