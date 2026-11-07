import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'

// Validation helper for the committed 8-bit, non-interlaced RGBA PNGs. No image edits.
export default function readPngAlpha(png) {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  assert.equal(png[24], 8)
  assert.equal(png[25], 6)
  assert.equal(png[28], 0)
  const chunks = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * 4
  assert.equal(raw.length, (stride + 1) * height)
  const alpha = new Uint8Array(width * height)
  let previous = Buffer.alloc(stride)
  let transparent = 0
  let opaque = 0
  const bounds = [width, height, -1, -1]
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(stride)
    const filter = raw[y * (stride + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? row[x - 4] : 0
      const up = previous[x]
      const diagonal = x >= 4 ? previous[x - 4] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      if (filter === 2) predictor = up
      if (filter === 3) predictor = Math.floor((left + up) / 2)
      if (filter === 4) {
        const p = left + up - diagonal
        const a = Math.abs(p - left),
          b = Math.abs(p - up),
          c = Math.abs(p - diagonal)
        predictor = a <= b && a <= c ? left : b <= c ? up : diagonal
      }
      row[x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255
    }
    for (let x = 0; x < width; x++) {
      const value = row[x * 4 + 3]
      alpha[y * width + x] = value
      if (value === 0) transparent++
      else {
        bounds[0] = Math.min(bounds[0], x)
        bounds[1] = Math.min(bounds[1], y)
        bounds[2] = Math.max(bounds[2], x)
        bounds[3] = Math.max(bounds[3], y)
        if (value === 255) opaque++
      }
    }
    previous = row
  }
  return { width, height, alpha, bounds, transparent, opaque }
}
