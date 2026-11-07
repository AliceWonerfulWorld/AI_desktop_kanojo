import './style.css'
import { characterAssets } from './character/assets'
import { PngCharacterRenderer } from './character/png-renderer'
import type { CharacterRenderer, RenderResult } from './character/renderer'

const character = document.querySelector<HTMLDivElement>('#character')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
let activePointer: number | undefined
let interactive: boolean | undefined
let lastPointer: { x: number; y: number } | undefined
let renderer: CharacterRenderer
let removePreview: (() => void) | undefined

function updateHitTest(x: number, y: number): void {
  lastPointer = { x, y }
  if (activePointer !== undefined) return
  const hit = renderer.hitTest(x, y)
  character.dataset.interactive = String(hit)
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

function rendered(result: RenderResult): void {
  status.textContent = result.assetId
    ? `Main → Preload → Renderer の接続を確認しました。テスト素材: ${result.assetId}。状態: ${result.state.action}/${result.state.expression}${result.fallback ? '（代替画像）' : ''}`
    : '画像を読み込めません。トレイから開発者ツールを開いてください。'
  character.dataset.ready = String(!!result.assetId)
  if (lastPointer) updateHitTest(lastPointer.x, lastPointer.y)
}

async function initialize(): Promise<void> {
  window.desktop.setPointerInteractive(false)
  renderer = new PngCharacterRenderer(character, characterAssets, rendered)
  document.addEventListener('mousemove', (event) =>
    updateHitTest(event.clientX, event.clientY),
  )
  document.addEventListener('mouseleave', () => {
    lastPointer = undefined
    if (activePointer === undefined) {
      interactive = false
      character.dataset.interactive = 'false'
      window.desktop.setPointerInteractive(false)
    }
  })
  character.addEventListener('pointerdown', (event) => {
    if (
      event.button !== 0 ||
      activePointer !== undefined ||
      !renderer.hitTest(event.clientX, event.clientY)
    )
      return
    character.setPointerCapture(event.pointerId)
    activePointer = event.pointerId
    document.body.classList.add('dragging')
    window.desktop.setDragging(true)
  })
  // Prevent the native context-menu event on transparent pixels, even with click-through disabled.
  character.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    if (renderer.hitTest(event.clientX, event.clientY))
      window.desktop.openMenu()
  })
  character.addEventListener('pointerup', stopDrag)
  character.addEventListener('pointercancel', () => stopDrag())
  character.addEventListener('lostpointercapture', () => stopDrag())
  window.addEventListener('blur', () => stopDrag())
  window.addEventListener('pagehide', () => {
    stopDrag()
    removePreview?.()
    renderer.dispose()
  })
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
  await renderer.setState({ action: 'idle', expression: 'neutral' })
  if (import.meta.env.DEV) {
    const { installCharacterPreview } = await import('./character/preview')
    removePreview = installCharacterPreview(renderer)
  }
}

void initialize().catch((error: unknown) => {
  window.desktop.setPointerInteractive(false)
  status.textContent =
    '初期化に失敗しました。トレイから開発者ツールを開いてください。'
  console.error('Renderer initialization failed', error)
})
