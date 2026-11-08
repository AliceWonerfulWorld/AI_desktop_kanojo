import { isOutfitId, type OutfitId } from '../../../shared/outfits'
import type { CharacterVisualState } from '../../../shared/character-state'
import { assetCandidates, type CharacterAsset } from './asset-selection'
import { alphaHitTest, containRect } from './alpha-hit-test'
import type { CharacterRenderer, RenderResult } from './renderer'

interface Frame {
  image: HTMLImageElement
  alpha: Uint8ClampedArray
}

export class PngCharacterRenderer implements CharacterRenderer {
  private readonly canvas = document.createElement('canvas')
  private readonly observer: ResizeObserver
  private readonly cache = new Map<string, Promise<Frame>>()
  private readonly loadTokens = new Map<string, symbol>()
  private frame: Frame | undefined
  private revision = 0
  private disposed = false
  private outfitGeneration = 0
  private outfitId: OutfitId = 'default'
  private state: CharacterVisualState = {
    action: 'idle',
    expression: 'neutral',
  }

  constructor(
    host: HTMLElement,
    private readonly assets: readonly CharacterAsset[],
    private readonly onRendered: (result: RenderResult) => void = () => {},
  ) {
    this.canvas.setAttribute('aria-hidden', 'true')
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.display = 'block'
    this.canvas.style.pointerEvents = 'none'
    host.append(this.canvas)
    this.observer = new ResizeObserver(() => this.draw())
    this.observer.observe(host)
    window.addEventListener('resize', this.draw)
  }

  private load(asset: CharacterAsset): Promise<Frame> {
    const cached = this.cache.get(asset.id)
    if (cached) return cached
    const token = Symbol()
    this.loadTokens.set(asset.id, token)
    const pending: Promise<Frame> = (async () => {
      const image = new Image()
      image.src = asset.url
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          image.decode(),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(new Error('Image load timed out')),
              5000,
            )
          }),
        ])
        // Selected 3072×5500 PNGs are 16,896,000 pixels; keep a bounded ceiling.
        if (image.naturalWidth * image.naturalHeight > 18_000_000)
          throw new Error('Image exceeds pixel budget')
        const buffer = document.createElement('canvas')
        buffer.width = image.naturalWidth
        buffer.height = image.naturalHeight
        const context = buffer.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Canvas 2D unavailable')
        context.drawImage(image, 0, 0)
        const rgba = context.getImageData(
          0,
          0,
          buffer.width,
          buffer.height,
        ).data
        // Keep original-pixel hit testing without retaining RGB for every 4K frame.
        const alpha = new Uint8ClampedArray(
          image.naturalWidth * image.naturalHeight,
        )
        for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!
        buffer.width = 0
        buffer.height = 0
        if (this.disposed || this.loadTokens.get(asset.id) !== token)
          throw Error('Frame no longer retained')
        this.alphaSizes.set(asset.id, alpha.byteLength)
        this.retainedAlphaBytes += alpha.byteLength
        return {
          image,
          alpha,
        }
      } finally {
        clearTimeout(timeout)
      }
    })()
    this.cache.set(asset.id, pending)
    void pending.catch(() => {
      if (this.cache.get(asset.id) === pending) this.cache.delete(asset.id)
    })
    return pending
  }

  /** Decode neutral into the actual renderer cache without changing display/hit regions. */
  async prepareOutfit(outfitId: OutfitId): Promise<boolean> {
    if (!isOutfitId(outfitId) || this.disposed) return false
    const neutral = this.assets.find(
      (a) =>
        (a.outfitId ?? 'default') === outfitId &&
        a.action === 'idle' &&
        a.expression === 'neutral',
    )
    if (!neutral) return false
    try {
      await this.load(neutral)
      return !this.disposed
    } catch {
      return false
    }
  }
  async setOutfit(outfitId: OutfitId): Promise<RenderResult> {
    const generation = ++this.outfitGeneration
    // Preflight first. Failed switches preserve both pixels and original alpha mask.
    if (
      !(await this.prepareOutfit(outfitId)) ||
      generation !== this.outfitGeneration
    )
      return {
        state: { ...this.state, outfitId },
        assetId: null,
        applied: false,
        fallback: true,
        unavailable: [],
      }
    this.outfitId = outfitId
    // Decode of the latest action/expression happens after Main commits the selection.
    for (const [id] of this.cache) {
      if (
        !this.assets.some(
          (a) => a.id === id && (a.outfitId ?? 'default') === outfitId,
        )
      ) {
        this.cache.delete(id)
        this.loadTokens.delete(id)
        this.retainedAlphaBytes -= this.alphaSizes.get(id) ?? 0
        this.alphaSizes.delete(id)
      }
    }
    return this.setState(this.state)
  }
  getCacheStats(): { entries: number; alphaBytes: number } {
    return { entries: this.cache.size, alphaBytes: this.retainedAlphaBytes }
  }
  private retainedAlphaBytes = 0
  private readonly alphaSizes = new Map<string, number>()
  async setState(state: CharacterVisualState): Promise<RenderResult> {
    const revision = ++this.revision
    this.state = { ...state }
    const requested = { ...state, outfitId: state.outfitId ?? this.outfitId }
    const unavailable: string[] = []
    for (const asset of assetCandidates(requested, this.assets)) {
      if (this.disposed || revision !== this.revision) break
      let frame: Frame
      try {
        frame = await this.load(asset)
      } catch {
        unavailable.push(asset.id)
        continue
      }
      if (this.disposed || revision !== this.revision) break
      this.frame = frame
      this.draw()
      const result: RenderResult = {
        state: requested,
        assetId: asset.id,
        applied: true,
        fallback:
          asset.action !== requested.action ||
          asset.expression !== requested.expression,
        unavailable,
      }
      this.onRendered(result)
      return result
    }
    const applied = !this.disposed && revision === this.revision
    const result: RenderResult = {
      state: requested,
      assetId: null,
      fallback: true,
      applied,
      unavailable,
    }
    if (applied) {
      this.frame = undefined
      this.draw()
      this.onRendered(result)
    }
    return result
  }

  private draw = (): void => {
    if (this.disposed) return
    const box = this.canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    this.canvas.width = Math.max(1, Math.round(box.width * ratio))
    this.canvas.height = Math.max(1, Math.round(box.height * ratio))
    const context = this.canvas.getContext('2d')
    if (!context || !this.frame || box.width <= 0 || box.height <= 0) return
    context.scale(ratio, ratio)
    const image = this.frame.image
    const rect = containRect(image.naturalWidth, image.naturalHeight, {
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
    })
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height)
  }

  hitTest(clientX: number, clientY: number): boolean {
    if (!this.frame || this.disposed) return false
    const rect = this.canvas.getBoundingClientRect()
    return alphaHitTest(
      this.frame.alpha,
      this.frame.image.naturalWidth,
      this.frame.image.naturalHeight,
      { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      clientX,
      clientY,
      1,
    )
  }

  dispose(): void {
    this.disposed = true
    this.revision++
    this.observer.disconnect()
    window.removeEventListener('resize', this.draw)
    this.frame = undefined
    this.cache.clear()
    this.loadTokens.clear()
    this.alphaSizes.clear()
    this.retainedAlphaBytes = 0
    this.canvas.remove()
  }
}
