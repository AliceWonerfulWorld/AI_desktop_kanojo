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

export function initialBounds(area: Bounds): Bounds {
  return fitToWorkArea(
    {
      x: area.x + area.width - 340 - 24,
      y: area.y + area.height - 632 - 24,
      width: 340,
      // Preserve the 520 DIP character area and reserve 112 DIP for dialogue above it.
      height: 632,
    },
    area,
  )
}
