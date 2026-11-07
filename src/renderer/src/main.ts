import './style.css'

const character = document.querySelector<HTMLDivElement>('#character')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
let activePointer: number | undefined
let interactive: boolean | undefined

function updateHitTest(x: number, y: number): void {
  if (activePointer !== undefined) return
  const hit = !!document.elementFromPoint(x, y)?.closest('[data-hit]')
  if (hit !== interactive) {
    interactive = hit
    window.desktop.setPointerInteractive(hit)
  }
}

function stopDrag(event?: PointerEvent): void {
  if (activePointer === undefined) return
  const pointer = activePointer
  activePointer = undefined
  if (character.hasPointerCapture(pointer))
    character.releasePointerCapture(pointer)
  document.body.classList.remove('dragging')
  window.desktop.setDragging(false)
  if (event) updateHitTest(event.clientX, event.clientY)
}

try {
  window.desktop.setPointerInteractive(false)
  document.addEventListener('mousemove', (event) =>
    updateHitTest(event.clientX, event.clientY),
  )
  document.addEventListener('mouseleave', () => {
    if (activePointer === undefined) {
      interactive = false
      window.desktop.setPointerInteractive(false)
    }
  })
  character.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || activePointer !== undefined) return
    character.setPointerCapture(event.pointerId)
    activePointer = event.pointerId
    document.body.classList.add('dragging')
    window.desktop.setDragging(true)
  })
  character.addEventListener('pointerup', stopDrag)
  character.addEventListener('pointercancel', () => stopDrag())
  character.addEventListener('lostpointercapture', () => stopDrag())
  window.addEventListener('blur', () => stopDrag())
  window.addEventListener('pagehide', () => stopDrag())
  character.addEventListener('keydown', (event) => {
    if (
      (event.shiftKey && event.key === 'F10') ||
      event.key === 'ContextMenu' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault()
      window.desktop.openMenu()
    }
  })
  status.textContent = 'Main → Preload → Renderer の接続を確認しました。'
} catch (error) {
  status.textContent =
    '初期化に失敗しました。トレイから開発者ツールを開いてください。'
  console.error('Renderer initialization failed', error)
}
