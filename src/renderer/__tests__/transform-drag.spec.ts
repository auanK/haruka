import { describe, expect, it } from 'vitest'
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import { deriveRotationAngle, deriveScaleFactor, derivePointerTranslation } from '../transform-drag'

const rect = { left: 0, top: 0, width: 800, height: 600 }
const cameras = [
  new PerspectiveCamera(45, 4 / 3, 0.1, 1000),
  new OrthographicCamera(-4, 4, 3, -3, 0.1, 1000),
]
for (const camera of cameras) {
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
}

describe('camera-relative transform gestures', () => {
  it.each(cameras)('measures positive quarter-turns around Z with %s', (camera) => {
    const angle = deriveRotationAngle(camera, rect, [500, 300], [400, 200], [0, 0, 0], [0, 0, 1])
    expect(angle).toBeCloseTo(Math.PI / 2, 10)
  })
  it.each(cameras)('measures world/local directions rather than screen XY with %s', (camera) => {
    const delta = derivePointerTranslation(
      camera,
      rect,
      [400, 300],
      [450, 250],
      [0, 0, 0],
      [1, 0, 0],
      null,
    )
    expect(delta?.[0]).toBeGreaterThan(0)
    expect(delta?.[1]).toBe(0)
    expect(delta?.[2]).toBe(0)
    const plane = derivePointerTranslation(
      camera,
      rect,
      [400, 300],
      [450, 250],
      [0, 0, 0],
      null,
      [0, 0, 1],
    )
    expect(plane?.[0]).toBeGreaterThan(0)
    expect(plane?.[1]).toBeGreaterThan(0)
    expect(plane?.[2]).toBe(0)
  })
  it('supports radial uniform scaling and negative scaling across the pivot', () => {
    expect(deriveScaleFactor([500, 300], [600, 300], [400, 300])).toBe(2)
    expect(deriveScaleFactor([500, 300], [300, 300], [400, 300])).toBe(-1)
    expect(deriveScaleFactor([400, 300], [460, 300], [400, 300])).toBe(1.5)
  })
  it('has finite fallbacks when a rotation starts at the pivot or an axis faces the camera', () => {
    expect(
      deriveRotationAngle(cameras[0]!, rect, [400, 300], [440, 300], [0, 0, 0], [0, 0, 1]),
    ).toBeCloseTo(0.4)
    const movement = derivePointerTranslation(
      cameras[0]!,
      rect,
      [400, 300],
      [450, 300],
      [0, 0, 0],
      [0, 0, 1],
      null,
    )
    expect(movement?.every(Number.isFinite)).toBe(true)
    expect(new Vector3(...movement!).length()).toBeGreaterThan(0)
  })
})
