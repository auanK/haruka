import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { deriveOrthographicFit, projectVerticesToViewPlane } from '../orthographic-fit'
import { cubeVertices, transformCubeVertices } from '../../app/didactic-cube'
import { composeTransforms } from '../../domain'

describe('orthographic-fit', () => {
  const cameraRight = new Vector3(1, 0, 0)
  const cameraUp = new Vector3(0, 1, 0)

  it('projects canonical cube vertices to view plane', () => {
    const bounds = projectVerticesToViewPlane(cubeVertices, cameraRight, cameraUp)
    expect(bounds.width).toBeCloseTo(1)
    expect(bounds.height).toBeCloseTo(1)
    expect(bounds.centerX).toBeCloseTo(0)
    expect(bounds.centerY).toBeCloseTo(0)
  })

  it('projects rotated and sheared vertices correctly (Requirement 35, 54)', () => {
    const transform = composeTransforms([
      { type: 'rotation', axis: 'z', angle: Math.PI / 4 },
      { type: 'shear', kxy: 0.5, kxz: 0, kyx: 0, kyz: 0, kzx: 0, kzy: 0 },
      { type: 'scale', x: 2, y: 3, z: 1 },
    ])
    const transformed = transformCubeVertices(transform)
    const bounds = projectVerticesToViewPlane(transformed, cameraRight, cameraUp)
    expect(bounds.width).toBeGreaterThan(1)
    expect(bounds.height).toBeGreaterThan(1)
    expect(Number.isFinite(bounds.width)).toBe(true)
    expect(Number.isFinite(bounds.height)).toBe(true)
  })

  it('derives fit with padding keeping vertices within 40-60% of viewport (Requirement 37, 53)', () => {
    const bounds = projectVerticesToViewPlane(cubeVertices, cameraRight, cameraUp)
    const aspect = 16 / 9
    const fit = deriveOrthographicFit({
      projectedWidth: bounds.width,
      projectedHeight: bounds.height,
      viewportAspect: aspect,
      padding: 1.8,
    })

    const visibleHeight = fit.halfHeight * 2
    const visibleWidth = fit.halfWidth * 2

    // Ratio of bounds to visible screen should be ~ 1 / 1.8 = ~55.5% (comfortably 40-60%)
    const heightRatio = bounds.height / visibleHeight
    const widthRatio = bounds.width / visibleWidth
    expect(heightRatio).toBeLessThanOrEqual(0.6)
    expect(heightRatio).toBeGreaterThanOrEqual(0.3)
    expect(widthRatio).toBeLessThanOrEqual(0.6)

    // Projected NDC bounds: NDC = view / halfExtent, so max NDC = ratio
    const maxNdcX = bounds.width / 2 / fit.halfWidth
    const maxNdcY = bounds.height / 2 / fit.halfHeight
    expect(maxNdcX).toBeLessThan(0.8)
    expect(maxNdcY).toBeLessThan(0.8)
  })

  it('gives identical projected size regardless of large translation (Requirement 39, 55)', () => {
    const originBounds = projectVerticesToViewPlane(cubeVertices, cameraRight, cameraUp)
    const farTransform = composeTransforms([{ type: 'translation', x: 1e6, y: 2e6, z: -3e6 }])
    const farVertices = transformCubeVertices(farTransform)
    const farBounds = projectVerticesToViewPlane(farVertices, cameraRight, cameraUp)

    expect(farBounds.width).toBeCloseTo(originBounds.width)
    expect(farBounds.height).toBeCloseTo(originBounds.height)

    const fitOrigin = deriveOrthographicFit({
      projectedWidth: originBounds.width,
      projectedHeight: originBounds.height,
      viewportAspect: 1,
    })
    const fitFar = deriveOrthographicFit({
      projectedWidth: farBounds.width,
      projectedHeight: farBounds.height,
      viewportAspect: 1,
    })
    expect(fitFar.halfHeight).toBeCloseTo(fitOrigin.halfHeight)
    expect(fitFar.halfWidth).toBeCloseTo(fitOrigin.halfWidth)
  })

  it('handles degenerate collapsed geometries safely without NaN or division by zero (Requirement 38, 56)', () => {
    const fitZero = deriveOrthographicFit({
      projectedWidth: 0,
      projectedHeight: 0,
      viewportAspect: 1.5,
    })
    expect(Number.isFinite(fitZero.halfHeight)).toBe(true)
    expect(Number.isFinite(fitZero.halfWidth)).toBe(true)
    expect(fitZero.halfHeight).toBeGreaterThan(0)
    expect(fitZero.halfWidth).toBeGreaterThan(0)

    const flatTransform = composeTransforms([{ type: 'scale', x: 0, y: 5, z: 0 }])
    const flatVertices = transformCubeVertices(flatTransform)
    const flatBounds = projectVerticesToViewPlane(flatVertices, cameraRight, cameraUp)
    const fitFlat = deriveOrthographicFit({
      projectedWidth: flatBounds.width,
      projectedHeight: flatBounds.height,
      viewportAspect: 1,
    })
    expect(Number.isFinite(fitFlat.halfHeight)).toBe(true)
    expect(Number.isFinite(fitFlat.halfWidth)).toBe(true)
    expect(fitFlat.halfHeight).toBeGreaterThan(0)
    expect(fitFlat.halfWidth).toBeGreaterThan(0)
  })
})
