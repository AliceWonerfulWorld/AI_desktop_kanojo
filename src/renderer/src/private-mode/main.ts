import type {
  PrivateModeState,
  PrivateModeCommand,
} from '../../../shared/private-mode'
const element = <T extends HTMLElement>(id: string): T =>
  document.querySelector<T>(`#${id}`)!
let state: PrivateModeState | undefined
const status = element('status')
function render(next: PrivateModeState): void {
  if (state && next.revision < state.revision) return
  const wasConfirmation = state?.phase === 'confirmation'
  state = next
  document.body.dataset.phase = next.phase
  document.body.dataset.paused = String(next.paused)
  element('confirmation').hidden = next.phase !== 'confirmation'
  element('private-content').hidden = next.phase !== 'active'
  element('resume').hidden = !next.paused
  element('progress').textContent = next.paused
    ? '進行は一時停止中です。再開には明示操作が必要です。'
    : '手動操作で確認できます。自動進行はありません。'
  status.textContent = ''
  if (wasConfirmation && next.phase === 'active') element('return').focus()
}
async function command(kind: PrivateModeCommand['kind']): Promise<void> {
  if (!state) return
  const request: PrivateModeCommand =
    kind === 'confirm'
      ? { kind, session: state.session, accepted: true }
      : { kind, session: state.session }
  try {
    await window.privateMode.command(request)
  } catch {
    status.textContent =
      '操作できませんでした。日常へ戻るか、設定から開き直してください。'
  }
}
element<HTMLInputElement>('adult').addEventListener('change', () => {
  element<HTMLButtonElement>('enter').disabled =
    !element<HTMLInputElement>('adult').checked
})
element('enter').addEventListener('click', () => {
  if (!element<HTMLInputElement>('adult').checked) return
  element<HTMLButtonElement>('enter').disabled = true
  void command('confirm')
})
for (const [id, kind] of [
  ['return', 'return'],
  ['cancel', 'return'],
  ['hide', 'hide'],
  ['resume', 'resume'],
] as const)
  element(id).addEventListener('click', () => {
    void command(kind)
  })
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !event.repeat) {
    event.preventDefault()
    void command('return')
  }
})
const remove = window.privateMode.onChange(render)
window.addEventListener('pagehide', remove)
void window.privateMode
  .getState()
  .then((next) => {
    render(next)
    element('cancel').focus()
  })
  .catch(() => {
    status.textContent = '読み込めませんでした。ウィンドウを閉じてください。'
  })
