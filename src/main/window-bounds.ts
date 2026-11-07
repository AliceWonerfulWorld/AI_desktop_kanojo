export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** All coordinates are Electron DIP, including negative monitor origins. */
export function fitToWorkArea(bounds: Bounds, area: Bounds): Bounds {
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  return {
    x: Math.round(
      Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    ),
    width,
    height,
  }
}

export function scaledBounds(
  bounds: Bounds,
  area: Bounds,
  scale: number,
): Bounds {
  const width = Math.max(340, Math.round(340 * scale))
  const height = 112 + Math.round(468 * scale)
  return fitToWorkArea(
    {
      x: bounds.x + (bounds.width - width) / 2,
      y: bounds.y + bounds.height - height,
      width,
      height,
    },
    area,
  )
}

export function initialBounds(area: Bounds, scale = 1): Bounds {
  const width = Math.max(340, Math.round(340 * scale))
  const height = 112 + Math.round(468 * scale)
  return fitToWorkArea(
    {
      x: area.x + area.width - width - 24,
      y: area.y + area.height - height - 24,
      width,
      // Compact window with a reserved dialogue area above the character.
      height,
    },
    area,
  )
}
