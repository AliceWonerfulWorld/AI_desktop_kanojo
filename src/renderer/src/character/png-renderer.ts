import type { CharacterVisualState } from '../../../shared/character-state'
import { assetCandidates, type CharacterAsset } from './asset-selection'
import { alphaHitTest, containRect } from './alpha-hit-test'
import type { CharacterRenderer, RenderResult } from './renderer'

interface Frame {
  image: HTMLImageElement
  pixels: Uint8ClampedArray
}

export class PngCharacterRenderer implements CharacterRenderer {
  private readonly canvas = document.createElement('canvas')
  private readonly observer: ResizeObserver
  private readonly cache = new Map<string, Promise<Frame>>()
  private frame: Frame | undefined
  private revision = 0
  private disposed = false

  constructor(
    host: HTMLElement,
    private readonly assets: readonly CharacterAsset[],
    private readonly onRendered: (result: RenderResult) => void = () => {},
  ) {
    this.canvas.setAttribute('aria-hidden', 'true')
    host.append(this.canvas)
    this.observer = new ResizeObserver(() => this.draw())
    this.observer.observe(host)
    window.addEventListener('resize', this.draw)
  }

  private load(asset: CharacterAsset): Promise<Frame> {
    const cached = this.cache.get(asset.id)
    if (cached) return cached
    const pending = (async () => {
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
        if (image.naturalWidth * image.naturalHeight > 16_000_000)
          throw new Error('Image exceeds pixel budget')
        const buffer = document.createElement('canvas')
        buffer.width = image.naturalWidth
        buffer.height = image.naturalHeight
        const context = buffer.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Canvas 2D unavailable')
        context.drawImage(image, 0, 0)
        return {
          image,
          pixels: context.getImageData(0, 0, buffer.width, buffer.height).data,
        }
      } finally {
        clearTimeout(timeout)
      }
    })()
    this.cache.set(asset.id, pending)
    return pending
  }

  async setState(state: CharacterVisualState): Promise<RenderResult> {
    const revision = ++this.revision
    const requested = { ...state }
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
      this.frame.pixels,
      this.frame.image.naturalWidth,
      this.frame.image.naturalHeight,
      { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      clientX,
      clientY,
    )
  }

  dispose(): void {
    this.disposed = true
    this.revision++
    this.observer.disconnect()
    window.removeEventListener('resize', this.draw)
    this.frame = undefined
    this.cache.clear()
    this.canvas.remove()
  }
}
