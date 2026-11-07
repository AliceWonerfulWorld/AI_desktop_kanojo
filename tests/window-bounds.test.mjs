import assert from 'node:assert/strict'
import test from 'node:test'
import { fitToWorkArea, initialBounds } from '../src/main/window-bounds.ts'

test('uses work area, leaving taskbar space untouched', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 }
  assert.deepEqual(initialBounds(area), {
    x: 1556,
    y: 384,
    width: 340,
    height: 632,
  })
  assert.deepEqual(
    fitToWorkArea({ x: 2000, y: 1100, width: 340, height: 520 }, area),
    {
      x: 1580,
      y: 520,
      width: 340,
      height: 520,
    },
  )
})

test('accepts negative origins on monitors left of or above primary', () => {
  const area = { x: -1920, y: -900, width: 1920, height: 1080 }
  assert.deepEqual(
    fitToWorkArea({ x: -2300, y: -1500, width: 340, height: 520 }, area),
    {
      x: -1920,
      y: -900,
      width: 340,
      height: 520,
    },
  )
})

test('recovers a removed monitor position into the remaining work area', () => {
  const area = { x: 0, y: 24, width: 1280, height: 696 }
  assert.deepEqual(
    fitToWorkArea({ x: -1800, y: 900, width: 340, height: 520 }, area),
    {
      x: 0,
      y: 200,
      width: 340,
      height: 520,
    },
  )
})

test('fits a tiny work area without unreachable portions', () => {
  const area = { x: 100, y: 200, width: 240, height: 300 }
  assert.deepEqual(initialBounds(area), area)
})

test('keeps DIP coordinates independent of monitor scale factors', () => {
  const area = { x: 1920, y: 0, width: 1280, height: 680 }
  const bounds = { x: 2100, y: 80, width: 340, height: 520 }
  assert.deepEqual(fitToWorkArea(bounds, area), bounds)
  assert.deepEqual(fitToWorkArea(fitToWorkArea(bounds, area), area), bounds)
})
