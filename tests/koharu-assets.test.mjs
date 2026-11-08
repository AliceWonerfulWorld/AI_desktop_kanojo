import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { URL } from 'node:url'
import readPngAlpha from '../scripts/lib/read-png-alpha.mjs'
import { assetCandidates } from '../src/renderer/src/character/asset-selection.ts'
import { alphaHitTest } from '../src/renderer/src/character/alpha-hit-test.ts'

const manifest = JSON.parse(
  readFileSync(new URL('../assets/character/manifest.json', import.meta.url)),
)

const defaultAssets = manifest.assets.filter((a) => a.outfitId === 'default')
test('selected koharu PNGs are distinct RGBA with transparent margins and gaps; fixtures stay separate', () => {
  assert.deepEqual(defaultAssets.map((asset) => asset.expression).sort(), [
    'affectionate',
    'neutral',
    'shy',
    'sleepy',
    'smile',
    'surprised',
  ])
  const hashes = new Set()
  for (const asset of defaultAssets) {
    assert.equal(asset.status, 'selected-rights-unverified')
    assert.ok(asset.file.startsWith('koharu/png/'))
    const png = readFileSync(
      new URL(`../assets/character/${asset.file}`, import.meta.url),
    )
    hashes.add(createHash('sha256').update(png).digest('hex'))
    const { width, height, alpha, transparent, opaque } = readPngAlpha(png)
    assert.deepEqual(
      [width, height],
      ['affectionate', 'smile'].includes(asset.expression)
        ? [1143, 2047]
        : [3072, 5500],
    )
    assert.ok(transparent > width * height * 0.5)
    assert.ok(opaque > 0)
    const data = new Uint8ClampedArray(alpha)
    const box = { x: 0, y: 0, width, height }
    assert.equal(alphaHitTest(data, width, height, box, 0, 0, 1), false)
    assert.equal(
      alphaHitTest(data, width, height, box, width / 2, height / 2, 1),
      true,
    )
    assert.equal(
      alphaHitTest(data, width, height, box, width / 2, height * 0.8, 1),
      false,
    )
  }
  assert.equal(
    hashes.size,
    6,
    'shy and affectionate must be different files too',
  )
})

test('all action/expression fallbacks stay within koharu, including smile and neutral recovery', () => {
  const assets = defaultAssets.map((asset) => ({ ...asset, url: asset.file }))
  for (const action of ['idle', 'reading', 'resting', 'sleeping']) {
    for (const expression of [
      'neutral',
      'smile',
      'sleepy',
      'surprised',
      'shy',
      'affectionate',
    ]) {
      const candidates = assetCandidates({ action, expression }, assets)
      assert.ok(candidates.length > 0)
      assert.ok(candidates.every((asset) => asset.id.startsWith('koharu-')))
      assert.equal(candidates[0].expression, expression)
      assert.ok(candidates.some((asset) => asset.expression === 'neutral'))
    }
  }
})

test('received loungewear PNGs are distinct RGBA originals with working alpha regions', () => {
  const assets = manifest.assets.filter((a) => a.outfitId === 'loungewear')
  assert.ok(assets.length >= 2)
  const hashes = new Set()
  for (const asset of assets) {
    const png = readFileSync(
      new URL(`../assets/character/${asset.file}`, import.meta.url),
    )
    const { width, height, alpha, transparent } = readPngAlpha(png)
    assert.deepEqual([width, height], [937, 1678])
    assert.equal(png[25], 6)
    assert.ok(transparent > width * height * 0.6)
    hashes.add(createHash('sha256').update(png).digest('hex'))
    const box = { x: 0, y: 0, width, height }
    assert.equal(alphaHitTest(alpha, width, height, box, 0, 0, 1), false)
    assert.equal(
      alphaHitTest(alpha, width, height, box, width / 2, height / 2, 1),
      true,
    )
    assert.equal(
      alphaHitTest(alpha, width, height, box, width / 2, height * 0.8, 1),
      false,
    )
  }
  assert.equal(hashes.size, assets.length)
})
