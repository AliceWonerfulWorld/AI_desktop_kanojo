import { PointerGesture } from '../../interaction/pointer-gesture'
import { RelationshipModel } from '../../relationship/relationship'
import { InteractionRenderer } from './interaction/interaction-renderer'
import { timeContextAt } from '../../behavior/time-policy'
import { createPresentationPause } from '../../behavior/presentation-pause'
import type { PresentationState } from '../../shared/presentation'
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
let gesture: PointerGesture | undefined
let interactions: InteractionRenderer | undefined
let renderer: CharacterRenderer
let behavior: BehaviorEngine | undefined
let removeBehaviorPreview: (() => void) | undefined
let removePreview: (() => void) | undefined
let removeRelationshipPreview: (() => void) | undefined
let relationship = new RelationshipModel(browserBehaviorClock.now)
let memoryRevision = 0
let presentation: PresentationState | undefined
let removePresentation: (() => void) | undefined
let updatePause: ((blocked: boolean) => void) | undefined
let suspended = false
function blocked(): boolean {
  return (
    suspended ||
    document.hidden ||
    presentation?.visible === false ||
    presentation?.settings.paused === true
  )
}
function syncPresentation(): void {
  updatePause?.(blocked())
  if (blocked()) {
    stopDrag()
    interactions?.cancelReaction()
    greeting?.hide()
  } else if (presentation?.settings.spontaneousDialogue === false)
    greeting?.hidePassive()
}
function receivePresentation(state: PresentationState): void {
  if (disposed || (presentation && state.revision < presentation.revision))
    return
  presentation = state
  syncPresentation()
}

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

function releasePointer(): void {
  const pointer = activePointer
  activePointer = undefined
  if (pointer !== undefined && character.hasPointerCapture(pointer))
    character.releasePointerCapture(pointer)
  document.body.classList.remove('dragging')
}
function stopDrag(): void {
  gesture?.cancel()
  releasePointer()
}
function finishPointer(event: PointerEvent): void {
  if (activePointer !== event.pointerId || event.button !== 0) return
  const finished = gesture!.end(event)
  releasePointer()
  updateHitTest(event.clientX, event.clientY)
  void finished
    .then((accepted) => {
      if (accepted && !disposed && !blocked()) interactions?.react()
    })
    .catch((error: unknown) => console.error('Interaction failed', error))
}

function rendered(result: RenderResult): void {
  status.textContent = result.assetId
    ? `Main → Preload → Renderer の接続を確認しました。素材: ${result.assetId}。状態: ${result.state.action}/${result.state.expression}${result.fallback ? '（代替画像）' : ''}`
    : '画像を読み込めません。トレイから開発者ツールを開いてください。'
  character.dataset.ready = String(!!result.assetId)
  if (lastPointer) updateHitTest(lastPointer.x, lastPointer.y)
}

async function initialize(): Promise<void> {
  window.desktop.setPointerInteractive(false)
  removePresentation = window.desktop.onPresentation(receivePresentation)
  receivePresentation(await window.desktop.getPresentation())
  const savedMemory = await window.desktop.getMemory()
  if (disposed) return
  relationship = new RelationshipModel(
    browserBehaviorClock.now,
    savedMemory.affection,
  )
  greeting = new GreetingPresenter(
    document.querySelector<HTMLParagraphElement>('#greeting')!,
    browserBehaviorClock,
  )
  interactions = new InteractionRenderer(
    new PngCharacterRenderer(character, characterAssets, rendered),
    greeting,
    browserBehaviorClock,
    Math.random,
    (event) => {
      const currentRelationship = relationship
      const revision = ++memoryRevision
      void window.desktop
        .recordInteraction()
        .then((saved) => {
          if (
            !disposed &&
            revision === memoryRevision &&
            relationship === currentRelationship
          )
            relationship = new RelationshipModel(
              browserBehaviorClock.now,
              saved.affection,
            )
        })
        .catch((error: unknown) =>
          console.error('Interaction persistence failed', error),
        )
      window.dispatchEvent(
        new CustomEvent('character-interaction', { detail: event }),
      )
    },
    () => relationship.getSnapshot().stage,
  )
  renderer = interactions
  gesture = new PointerGesture({
    hitTest: (x, y) => renderer.hitTest(x, y),
    startDrag: () => window.desktop.setDragging(true),
    cancelDrag: () => window.desktop.setDragging(false),
    finishDrag: () => window.desktop.finishDrag(),
  })
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
    if (!gesture!.begin(event)) return
    activePointer = event.pointerId
    try {
      character.setPointerCapture(event.pointerId)
    } catch {
      stopDrag()
      return
    }
    document.body.classList.add('dragging')
  })
  character.addEventListener('pointermove', (event) => {
    for (const sample of event.getCoalescedEvents?.() ?? [])
      gesture?.move(sample)
    gesture?.move(event)
  })
  // Prevent the native context-menu event on transparent pixels, even with click-through disabled.
  character.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    stopDrag()
    if (renderer.hitTest(event.clientX, event.clientY))
      window.desktop.openMenu()
  })
  character.addEventListener('pointerup', finishPointer)
  character.addEventListener('pointercancel', () => stopDrag())
  character.addEventListener('lostpointercapture', () => {
    if (activePointer !== undefined) stopDrag()
  })
  window.addEventListener('blur', () => stopDrag())
  document.addEventListener('visibilitychange', () => {
    syncPresentation()
  })
  window.addEventListener('pagehide', () => {
    disposed = true
    stopDrag()
    gesture?.dispose()
    removePowerListener?.()
    removePresentation?.()
    removeTimePreview?.()
    greeting?.dispose()
    behavior?.dispose()
    removeBehaviorPreview?.()
    removePreview?.()
    removeRelationshipPreview?.()
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
  const publishTime = (): void => {
    const context = timeContextAt(localTime.now())
    document.body.dataset.timePeriod = context.period
    window.dispatchEvent(new CustomEvent('character-time', { detail: context }))
  }
  const displayGreeting = (firstLaunch: boolean): void => {
    publishTime()
    if (blocked() || !presentation?.settings.spontaneousDialogue) return
    greeting?.show(
      greetingFor(
        timeContextAt(localTime.now()).period,
        firstLaunch,
        relationship.getSnapshot().stage,
      ),
    )
  }
  behavior = createBehaviorRuntime(
    renderer,
    (event) => {
      character.dataset.action = event.snapshot.current?.action ?? ''
      if (event.snapshot.current)
        window.desktop.recordAction(event.snapshot.current.action)
      publishTime()
      window.dispatchEvent(
        new CustomEvent('character-behavior', { detail: event }),
      )
    },
    {
      clock: browserBehaviorClock,
      initialAction:
        savedMemory.lastAction === 'sleeping' &&
        timeContextAt(localTime.now()).period !== 'late-night'
          ? undefined
          : (savedMemory.lastAction ?? undefined),
      selectionPolicy: () => timeContextAt(localTime.now()),
    },
  )
  updatePause = createPresentationPause(behavior)
  removePowerListener = window.desktop.onPowerState((state) => {
    if (suspended === (state === 'suspend')) return
    suspended = state === 'suspend'
    syncPresentation()
    if (state === 'suspend') {
      stopDrag()
      interactions?.cancelReaction()
      greeting?.hide()
    } else {
      publishTime()
      if (!document.hidden && document.hasFocus()) displayGreeting(false)
    }
  })
  behavior.start()
  syncPresentation()
  displayGreeting(launchInfo.firstLaunch)
  document.body.dataset.lifecycleReady = 'true'
  if (import.meta.env.DEV) {
    const [
      { installCharacterPreview },
      { installBehaviorPreview },
      { installTimePreview },
      { installRelationshipPreview },
    ] = await Promise.all([
      import('./character/preview'),
      import('./behavior/preview'),
      import('./behavior/time-preview'),
      import('./interaction/relationship-preview'),
    ])
    if (disposed) return
    removePreview = installCharacterPreview(renderer)
    removeBehaviorPreview = installBehaviorPreview(behavior)
    removeTimePreview = installTimePreview(localTime, () =>
      displayGreeting(launchInfo.firstLaunch),
    )
    removeRelationshipPreview = installRelationshipPreview(
      () => relationship.getSnapshot(),
      (value) => {
        const next = new RelationshipModel(browserBehaviorClock.now, value)
        interactions?.cancelReaction()
        relationship = next
        return relationship.getSnapshot()
      },
      () => displayGreeting(false),
    )
  }
}

void initialize().catch((error: unknown) => {
  behavior?.dispose()
  greeting?.dispose()
  removePowerListener?.()
  removePresentation?.()
  window.desktop?.setPointerInteractive(false)
  status.textContent =
    '初期化に失敗しました。トレイから開発者ツールを開いてください。'
  console.error('Renderer initialization failed', error)
})
