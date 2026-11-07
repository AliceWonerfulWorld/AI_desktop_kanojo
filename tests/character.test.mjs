import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'
import {
  isCharacterVisualState,
  actions,
  expressions,
} from '../src/shared/character-state.ts'
import { assetCandidates } from '../src/renderer/src/character/asset-selection.ts'
import {
  alphaHitTest,
  containRect,
} from '../src/renderer/src/character/alpha-hit-test.ts'

const assets = [
  { id: 'reading-smile', action: 'reading', expression: 'smile', url: 'a' },
  { id: 'idle-smile', action: 'idle', expression: 'smile', url: 'b' },
  { id: 'reading-neutral', action: 'reading', expression: 'neutral', url: 'c' },
  { id: 'idle-neutral', action: 'idle', expression: 'neutral', url: 'd' },
]

test('validates all semantic states, with neutral as the canonical normal expression', () => {
  for (const action of actions)
    for (const expression of expressions)
      assert.ok(isCharacterVisualState({ action, expression }))
  for (const state of [
    null,
    {},
    { action: 'invalid', expression: 'neutral' },
    { action: 'idle', expression: 'normal' },
  ])
    assert.equal(isCharacterVisualState(state), false)
})

test('fallback preserves expression before action, deduplicates and retains requested meaning', () => {
  const state = { action: 'reading', expression: 'smile' }
  assert.deepEqual(
    assetCandidates(state, assets).map((asset) => asset.id),
    ['reading-smile', 'idle-smile', 'reading-neutral', 'idle-neutral'],
  )
  assert.deepEqual(state, { action: 'reading', expression: 'smile' })
  assert.deepEqual(
    assetCandidates({ action: 'sleeping', expression: 'shy' }, assets).map(
      (asset) => asset.id,
    ),
    ['idle-smile', 'idle-neutral'],
  )
  assert.equal(
    assetCandidates({ action: 'idle', expression: 'neutral' }, assets).length,
    1,
  )
  assert.deepEqual(assetCandidates(state, []), [])
})

test('alpha mask excludes transparent holes inside the image rectangle and accepts visible edge alpha', () => {
  const data = new Uint8ClampedArray(3 * 3 * 4)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  data[(1 * 3 + 1) * 4 + 3] = 0
  data[3] = 1
  const box = { x: 10, y: 20, width: 300, height: 300 }
  assert.equal(alphaHitTest(data, 3, 3, box, 160, 170), false)
  assert.equal(alphaHitTest(data, 3, 3, box, 11, 21), true)
  for (const [x, y] of [
    [9, 20],
    [310, 20],
    [10, 320],
    [NaN, 50],
  ])
    assert.equal(alphaHitTest(data, 3, 3, box, x, y), false)
})

test('scales to contain and bottom aligns without treating letterboxing as character pixels', () => {
  const box = { x: 100, y: 200, width: 400, height: 400 }
  assert.deepEqual(containRect(100, 200, box), {
    x: 200,
    y: 200,
    width: 200,
    height: 400,
  })
  assert.deepEqual(containRect(200, 100, box), {
    x: 100,
    y: 400,
    width: 400,
    height: 200,
  })
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0])
  assert.equal(alphaHitTest(data, 2, 1, box, 150, 450), true)
  assert.equal(alphaHitTest(data, 2, 1, box, 450, 450), false)
  assert.equal(alphaHitTest(data, 2, 1, box, 150, 300), false)
  assert.equal(alphaHitTest(data, 2, 1, { ...box, width: 0 }, 150, 450), false)
})

test('committed PNG fixtures match provenance and preserve an interior transparent gap', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../assets/character/manifest.json', import.meta.url)),
  )
  assert.equal(manifest.assets.length, 4)
  for (const asset of manifest.assets) {
    assert.equal(asset.status, 'test-only')
    assert.ok(isCharacterVisualState(asset))
    const png = readFileSync(
      new URL(`../assets/character/${asset.file}`, import.meta.url),
    )
    assert.equal(png.readUInt32BE(16), 340)
    assert.equal(png.readUInt32BE(20), 520)
    const compressed = []
    for (let offset = 8; offset < png.length;) {
      const size = png.readUInt32BE(offset)
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
        compressed.push(png.subarray(offset + 8, offset + 8 + size))
      offset += size + 12
    }
    const raw = inflateSync(Buffer.concat(compressed))
    const alpha = (x, y) => raw[y * (340 * 4 + 1) + 1 + x * 4 + 3]
    assert.equal(alpha(10, 10), 0)
    assert.equal(alpha(170, 312), 255)
    assert.equal(alpha(170, 480), 0)
    assert.equal(alpha(143, 480), 255)
  }
})
