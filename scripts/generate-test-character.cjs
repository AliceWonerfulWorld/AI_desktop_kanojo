// Deterministic geometric PNG fixtures, NOT Koharu's approved design.
// No image-generation model, downloaded art, or third-party drawing library.
const { deflateSync } = require('node:zlib')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const width = 340
const height = 520
const crc32 = (bytes) => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
for (const expression of ['neutral', 'smile', 'sleepy', 'surprised']) {
  const data = Buffer.alloc((width * 4 + 1) * height)
  const ellipse = (x, y, rx, ry, color) => {
    for (
      let py = Math.max(0, y - ry);
      py <= Math.min(height - 1, y + ry);
      py++
    ) {
      for (
        let px = Math.max(0, x - rx);
        px <= Math.min(width - 1, x + rx);
        px++
      ) {
        if (((px - x) / rx) ** 2 + ((py - y) / ry) ** 2 <= 1) {
          const offset = py * (width * 4 + 1) + 1 + px * 4
          data.set([...color, 255], offset)
        }
      }
    }
  }
  const ink = [83, 67, 88]
  const skin = [244, 215, 198]
  ellipse(170, 312, 62, 118, [217, 154, 167])
  ellipse(143, 457, 14, 49, ink)
  ellipse(197, 457, 14, 49, ink)
  ellipse(170, 162, 57, 73, ink)
  ellipse(170, 174, 48, 58, skin)
  ellipse(133, 333, 10, 37, skin)
  ellipse(207, 333, 10, 37, skin)
  const eyes = expression === 'sleepy' ? 2 : expression === 'surprised' ? 9 : 5
  ellipse(152, 177, 5, eyes, ink)
  ellipse(188, 177, 5, eyes, ink)
  ellipse(
    170,
    207,
    expression === 'surprised' ? 7 : 13,
    expression === 'smile' ? 7 : expression === 'surprised' ? 10 : 2,
    ink,
  )
  if (expression === 'smile') {
    ellipse(140, 197, 8, 4, [224, 146, 157])
    ellipse(200, 197, 8, 4, [224, 146, 157])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  writeFileSync(
    join(__dirname, '../assets/character/test', `${expression}.png`),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(data)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}
