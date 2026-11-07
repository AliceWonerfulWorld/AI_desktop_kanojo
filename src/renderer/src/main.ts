import './style.css'
import { timeContextAt } from '../../behavior/time-policy'
import { createPowerLifecycle } from '../../behavior/power-lifecycle'
import { GreetingPresenter, greetingFor } from './dialogue/greeting'
import { browserBehaviorClock, createBehaviorRuntime } from './behavior/runtime'
import type { BehaviorEngine } from '../../behavior/behavior-engine'
import { characterAssets } from './character/assets'
import { PngCharacterRenderer } from './character/png-renderer'
import type { CharacterRenderer, RenderResult } from './character/renderer'

const character = document.querySelector<HTMLDivElement>('#character')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const localTime = { now: () => new Date() }
let disposed = false
let greeting: GreetingPresenter | undefined
let removePowerListener: (() => void) | undefined
let removeTimePreview: (() => void) | undefined
let activePointer: number | undefined
let interactive: boolean | undefined
let lastPointer: { x: number; y: number } | undefined
let renderer: CharacterRenderer
let behavior: BehaviorEngine | undefined
let removeBehaviorPreview: (() => void) | undefined
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
    disposed = true
    stopDrag()
    removePowerListener?.()
    removeTimePreview?.()
    greeting?.dispose()
    behavior?.dispose()
    removeBehaviorPreview?.()
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
  const launchInfo = await window.desktop.getLaunchInfo()
  if (disposed) return
  greeting = new GreetingPresenter(
    document.querySelector<HTMLParagraphElement>('#greeting')!,
    browserBehaviorClock,
  )
  const publishTime = (): void => {
    const context = timeContextAt(localTime.now())
    document.body.dataset.timePeriod = context.period
    window.dispatchEvent(new CustomEvent('character-time', { detail: context }))
  }
  const displayGreeting = (firstLaunch: boolean): void => {
    publishTime()
    greeting?.show(
      greetingFor(timeContextAt(localTime.now()).period, firstLaunch),
    )
  }
  behavior = createBehaviorRuntime(
    renderer,
    (event) => {
      character.dataset.action = event.snapshot.current?.action ?? ''
      publishTime()
      window.dispatchEvent(
        new CustomEvent('character-behavior', { detail: event }),
      )
    },
    {
      clock: browserBehaviorClock,
      selectionPolicy: () => timeContextAt(localTime.now()),
    },
  )
  const powerLifecycle = createPowerLifecycle(behavior)
  removePowerListener = window.desktop.onPowerState((state) => {
    if (!powerLifecycle(state)) return
    if (state === 'suspend') greeting?.hide()
    else {
      publishTime()
      if (!document.hidden) displayGreeting(false)
    }
  })
  behavior.start()
  displayGreeting(launchInfo.firstLaunch)
  document.body.dataset.lifecycleReady = 'true'
  if (import.meta.env.DEV) {
    const [
      { installCharacterPreview },
      { installBehaviorPreview },
      { installTimePreview },
    ] = await Promise.all([
      import('./character/preview'),
      import('./behavior/preview'),
      import('./behavior/time-preview'),
    ])
    if (disposed) return
    removePreview = installCharacterPreview(renderer)
    removeBehaviorPreview = installBehaviorPreview(behavior)
    removeTimePreview = installTimePreview(localTime, () =>
      displayGreeting(launchInfo.firstLaunch),
    )
  }
}

void initialize().catch((error: unknown) => {
  behavior?.dispose()
  greeting?.dispose()
  removePowerListener?.()
  window.desktop?.setPointerInteractive(false)
  status.textContent =
    '初期化に失敗しました。トレイから開発者ツールを開いてください。'
  console.error('Renderer initialization failed', error)
})
