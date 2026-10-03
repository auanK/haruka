import { describe, expect, it } from 'vitest'
import { Frustum, Matrix4, PerspectiveCamera } from 'three'
import {
  chooseCoordinateLabelStride,
  computeWorldAnchoredCandidates,
  MAX_LABEL_CANDIDATES_PER_AXIS,
  next125Step,
  deriveVisibleAxisInterval,
} from '../coordinate-stride'

describe('chooseCoordinateLabelStride', () => {
  it('chooses stride 1 when projected pixels per unit is large enough (e.g. 60px)', () => {
    const stride = chooseCoordinateLabelStride({ pixelsPerUnit: 60 })
    expect(stride).toBe(1)
  })

  it('chooses stride 2 when projected pixels per unit drops to 25px', () => {
    const stride = chooseCoordinateLabelStride({ pixelsPerUnit: 25 })
    expect(stride).toBe(2)
  })

  it('chooses stride 5 when projected pixels per unit drops to 9px', () => {
    const stride = chooseCoordinateLabelStride({ pixelsPerUnit: 9 })
    expect(stride).toBe(5)
  })

  it('chooses 1, 2, 5 x 10^n progression for arbitrary zoom levels', () => {
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 100 })).toBe(1)
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 1.8 })).toBe(20)
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 0.7 })).toBe(50)
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 0.18 })).toBe(200)
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 0.018 })).toBe(2000)
  })

  it('never returns stride less than 1 (integer coordinates only)', () => {
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 500 })).toBe(1)
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 10000 })).toBe(1)
  })

  it('demonstrates hysteresis preventing jitter near threshold', () => {
    // For minSpacingDown = 32 and minSpacingUp = 48:
    // With currentStride = 1:
    // At pixelsPerUnit = 35px: stays at stride 1
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 35, currentStride: 1 })).toBe(1)
    // Drops to 30px (< 32): shifts to stride 2
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 30, currentStride: 1 })).toBe(2)

    // With currentStride = 2:
    // Now pixelsPerUnit moves back up to 35px:
    // With hysteresis, since 35px <= 48px, it STAYS at stride 2!
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 35, currentStride: 2 })).toBe(2)
    // Even at 45px, it stays at stride 2:
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 45, currentStride: 2 })).toBe(2)
    // Only when pixelsPerUnit exceeds 48px does it shift back down to stride 1:
    expect(chooseCoordinateLabelStride({ pixelsPerUnit: 50, currentStride: 2 })).toBe(1)
  })

  it('guarantees identical stride for microscopic camera variations', () => {
    const basePPU = 40.0
    const strideA = chooseCoordinateLabelStride({ pixelsPerUnit: basePPU, currentStride: 1 })
    const strideB = chooseCoordinateLabelStride({ pixelsPerUnit: basePPU + 0.05, currentStride: 1 })
    const strideC = chooseCoordinateLabelStride({ pixelsPerUnit: basePPU - 0.05, currentStride: 1 })

    expect(strideA).toBe(strideB)
    expect(strideA).toBe(strideC)
  })
})

describe('computeWorldAnchoredCandidates', () => {
  it('generates strictly world-anchored multiples for stride 1', () => {
    const candidates = computeWorldAnchoredCandidates(-3.2, 4.7, 1)
    expect(candidates).toEqual([-3, -2, -1, 0, 1, 2, 3, 4])
  })

  it('generates strictly world-anchored multiples for stride 5', () => {
    const candidates = computeWorldAnchoredCandidates(-12.8, 17.3, 5)
    expect(candidates).toEqual([-10, -5, 0, 5, 10, 15])
  })

  it('generates strictly world-anchored multiples for stride 10', () => {
    const candidates = computeWorldAnchoredCandidates(-24.5, 33.1, 10)
    expect(candidates).toEqual([-20, -10, 0, 10, 20, 30])
  })

  it('never alternates candidate identity on micro camera shifts', () => {
    // Camera moves by 0.02
    const setA = computeWorldAnchoredCandidates(-5.01, 5.01, 2)
    const setB = computeWorldAnchoredCandidates(-5.03, 4.99, 2)

    expect(setA).toEqual([-4, -2, 0, 2, 4])
    expect(setB).toEqual([-4, -2, 0, 2, 4])
  })

  it('enforces safety cap if range exceeds MAX_LABEL_CANDIDATES_PER_AXIS', () => {
    // A huge span of 100,000 units with stride 1 would be 100,000 candidates
    const candidates = computeWorldAnchoredCandidates(-50000, 50000, 1)
    expect(candidates.length).toBeLessThanOrEqual(MAX_LABEL_CANDIDATES_PER_AXIS)
  })
})

describe('unbounded mathematical stride', () => {
  it.each([1e-6, 1e-9, 1e-20, 1e-100])(
    'has no 100000 ceiling at %s pixels/unit',
    (pixelsPerUnit) => {
      const stride = chooseCoordinateLabelStride({ pixelsPerUnit })
      expect(Number.isFinite(stride)).toBe(true)
      expect(stride * pixelsPerUnit).toBeGreaterThanOrEqual(32)
      expect([1, 2, 5]).toContain(
        Number((stride / 10 ** Math.floor(Math.log10(stride))).toPrecision(10)),
      )
    },
  )

  it('bounds a million-unit interval without scanning integer coordinates', () => {
    const candidates = computeWorldAnchoredCandidates(-1000000, 1000000, 1)
    expect(candidates.length).toBeLessThanOrEqual(32)
  })

  it.each([NaN, Infinity, -Infinity])('rejects invalid intervals (%s)', (invalid) => {
    expect(computeWorldAnchoredCandidates(invalid, 10, 1)).toEqual([])
  })
})

describe('next125Step', () => {
  it.each([
    [1, 2],
    [2, 5],
    [5, 10],
    [10, 20],
    [100000, 200000],
    [1e20, 2e20],
  ])('advances %s to %s mathematically', (step, expected) => {
    expect(next125Step(step)).toBe(expected)
  })
})

describe('deriveVisibleAxisInterval', () => {
  const frustumAt = (x: number) => {
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000)
    camera.position.set(x, 5, 10)
    camera.lookAt(x, 0, 0)
    camera.updateMatrixWorld()
    return new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    )
  }

  it('intersects a bounded world axis interval with the actual frustum', () => {
    const interval = deriveVisibleAxisInterval(frustumAt(0), 'x', -100, 100)!
    expect(interval.min).toBeLessThan(0)
    expect(interval.max).toBeGreaterThan(5)
    expect(interval.min).toBeGreaterThan(-100)
    expect(interval.max).toBeLessThan(100)
  })

  it('supports large world coordinates and rejects invisible axes', () => {
    const frustum = frustumAt(100000)
    const interval = deriveVisibleAxisInterval(frustum, 'x', 99900, 100100)!
    expect(interval.min).toBeLessThan(100000)
    expect(interval.max).toBeGreaterThan(100000)
    expect(deriveVisibleAxisInterval(frustum, 'y', -100, 100)).toBeNull()
    expect(deriveVisibleAxisInterval(frustum, 'z', -100, 100)).toBeNull()
  })
})
