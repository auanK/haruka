import { describe, it, expect } from 'vitest'
import { identity, multiply } from '../matrix'
import { transformPoint } from '../point'
import { toMatrix, type Rotation } from '../transform'

describe('Rotation', () => {
  describe('zero angle', () => {
    it('produces identity matrix for zero rotation on all axes', () => {
      const id = identity()
      for (const axis of ['x', 'y', 'z'] as const) {
        const m = toMatrix({ type: 'rotation', axis, angle: 0 })
        for (let i = 0; i < 16; i++) {
          expect(m[i]!).toBeCloseTo(id[i]!, 5)
        }
      }
    })
  })

  describe('Rotation X', () => {
    it('rotates (0, 1, 0) by π/2 around X to (0, 0, 1)', () => {
      const rx: Rotation = { type: 'rotation', axis: 'x', angle: Math.PI / 2 }
      const matrix = toMatrix(rx)
      const result = transformPoint(matrix, [0, 1, 0])

      expect(result[0]).toBeCloseTo(0, 5)
      expect(result[1]).toBeCloseTo(0, 5)
      expect(result[2]).toBeCloseTo(1, 5)
    })

    it('rotates with negative angle correctly', () => {
      const rx: Rotation = { type: 'rotation', axis: 'x', angle: -Math.PI / 2 }
      const matrix = toMatrix(rx)
      const result = transformPoint(matrix, [0, 1, 0])

      expect(result[0]).toBeCloseTo(0, 5)
      expect(result[1]).toBeCloseTo(0, 5)
      expect(result[2]).toBeCloseTo(-1, 5)
    })
  })

  describe('Rotation Y', () => {
    it('rotates (0, 0, 1) by π/2 around Y to (1, 0, 0)', () => {
      const ry: Rotation = { type: 'rotation', axis: 'y', angle: Math.PI / 2 }
      const matrix = toMatrix(ry)
      const result = transformPoint(matrix, [0, 0, 1])

      expect(result[0]).toBeCloseTo(1, 5)
      expect(result[1]).toBeCloseTo(0, 5)
      expect(result[2]).toBeCloseTo(0, 5)
    })

    it('rotates with negative angle correctly', () => {
      const ry: Rotation = { type: 'rotation', axis: 'y', angle: -Math.PI / 2 }
      const matrix = toMatrix(ry)
      const result = transformPoint(matrix, [1, 0, 0])

      expect(result[0]).toBeCloseTo(0, 5)
      expect(result[1]).toBeCloseTo(0, 5)
      expect(result[2]).toBeCloseTo(1, 5)
    })
  })

  describe('Rotation Z', () => {
    it('rotates (1, 0, 0) by π/2 around Z to (0, 1, 0)', () => {
      const rz: Rotation = { type: 'rotation', axis: 'z', angle: Math.PI / 2 }
      const matrix = toMatrix(rz)
      const result = transformPoint(matrix, [1, 0, 0])

      expect(result[0]).toBeCloseTo(0, 5)
      expect(result[1]).toBeCloseTo(1, 5)
      expect(result[2]).toBeCloseTo(0, 5)
    })

    it('rotates with negative angle correctly', () => {
      const rz: Rotation = { type: 'rotation', axis: 'z', angle: -Math.PI / 2 }
      const matrix = toMatrix(rz)
      const result = transformPoint(matrix, [1, 0, 0])

      expect(result[0]).toBeCloseTo(0, 5)
      expect(result[1]).toBeCloseTo(-1, 5)
      expect(result[2]).toBeCloseTo(0, 5)
    })
  })

  describe('inverse property', () => {
    it('satisfies R(θ) · R(-θ) ≈ I for arbitrary angles', () => {
      const theta = 1.234
      const id = identity()
      for (const axis of ['x', 'y', 'z'] as const) {
        const rPos = toMatrix({ type: 'rotation', axis, angle: theta })
        const rNeg = toMatrix({ type: 'rotation', axis, angle: -theta })
        const product = multiply(rPos, rNeg)

        for (let i = 0; i < 16; i++) {
          expect(product[i]!).toBeCloseTo(id[i]!, 5)
        }
      }
    })
  })
})
