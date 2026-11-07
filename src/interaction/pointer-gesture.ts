import type { DragResult } from '../shared/desktop-api'

export interface PointerSample {
  readonly pointerId: number
  readonly button: number
  readonly clientX: number
  readonly clientY: number
  readonly screenX: number
  readonly screenY: number
}
interface GesturePorts {
  hitTest(x: number, y: number): boolean
  startDrag(): void
  cancelDrag(): void
  finishDrag(): Promise<DragResult>
}

/** Native DIP movement is authoritative; renderer screen movement conservatively vetoes clicks. */
export class PointerGesture {
  private active: { pointer: PointerSample; moved: boolean } | undefined
  private ending = false
  private disposed = false
  private generation = 0
  private readonly ports: GesturePorts
  constructor(ports: GesturePorts) {
    this.ports = ports
  }
  get pointerId(): number | undefined {
    return this.active?.pointer.pointerId
  }
  begin(pointer: PointerSample): boolean {
    if (
      this.disposed ||
      this.active ||
      this.ending ||
      pointer.button !== 0 ||
      !this.ports.hitTest(pointer.clientX, pointer.clientY)
    )
      return false
    this.generation++
    this.active = { pointer, moved: false }
    this.ports.startDrag()
    return true
  }
  move(pointer: PointerSample): void {
    if (!this.active || this.active.pointer.pointerId !== pointer.pointerId)
      return
    const start = this.active.pointer
    if (
      Math.hypot(
        pointer.screenX - start.screenX,
        pointer.screenY - start.screenY,
      ) >= 6
    )
      this.active.moved = true
  }
  async end(pointer: PointerSample): Promise<boolean> {
    if (
      !this.active ||
      pointer.pointerId !== this.active.pointer.pointerId ||
      pointer.button !== 0
    )
      return false
    this.move(pointer)
    const candidate =
      !this.active.moved && this.ports.hitTest(pointer.clientX, pointer.clientY)
    const generation = this.generation
    this.active = undefined
    this.ending = true
    try {
      const native = await this.ports.finishDrag()
      return (
        !this.disposed &&
        generation === this.generation &&
        candidate &&
        native === 'click'
      )
    } catch {
      this.ports.cancelDrag()
      return false
    } finally {
      this.ending = false
    }
  }
  cancel(): void {
    this.generation++
    if (this.active || this.ending) this.ports.cancelDrag()
    this.active = undefined
  }
  dispose(): void {
    this.cancel()
    this.disposed = true
  }
}
