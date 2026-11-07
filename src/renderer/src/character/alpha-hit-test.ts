export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export function containRect(
  sourceWidth: number,
  sourceHeight: number,
  box: Rect,
): Rect {
  const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + box.height - height,
    width,
    height,
  }
}

/** Same mapping as drawing: aspect-fit, bottom-aligned; alpha 0 is always pass-through. */
export function alphaHitTest(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  box: Rect,
  x: number,
  y: number,
): boolean {
  if (
    ![x, y, box.x, box.y, box.width, box.height].every(Number.isFinite) ||
    box.width <= 0 ||
    box.height <= 0 ||
    width <= 0 ||
    height <= 0
  )
    return false
  const rect = containRect(width, height, box)
  if (
    x < rect.x ||
    y < rect.y ||
    x >= rect.x + rect.width ||
    y >= rect.y + rect.height
  )
    return false
  const px = Math.floor(((x - rect.x) * width) / rect.width)
  const py = Math.floor(((y - rect.y) * height) / rect.height)
  return (data[(py * width + px) * 4 + 3] ?? 0) > 0
}
