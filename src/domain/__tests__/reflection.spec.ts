import { describe, it, expect } from 'vitest'
import { identity, multiply } from '../matrix'
import { transformPoint } from '../point'
import { toMatrix, type Reflection } from '../transform'

describe('Reflection', () => {
  describe('plane yz (inverts X)', () => {
    const refYZ: Reflection = { type: 'reflection', plane: 'yz' }

    it('produces the expected reflection matrix across YZ plane', () => {
      // prettier-ignore
      const expected = [
        -1, 0, 0, 0,
         0, 1, 0, 0,
         0, 0, 1, 0,
         0, 0, 0, 1,
      ]

      expect(toMatrix(refYZ)).toEqual(expected)
    })

    it('inverts X coordinate while keeping Y and Z unchanged', () => {
      const matrix = toMatrix(refYZ)
      const result = transformPoint(matrix, [4, 7, -9])

      expect(result).toEqual([-4, 7, -9])
    })
  })

  describe('plane xz (inverts Y)', () => {
    const refXZ: Reflection = { type: 'reflection', plane: 'xz' }

    it('produces the expected reflection matrix across XZ plane', () => {
      // prettier-ignore
      const expected = [
        1,  0, 0, 0,
        0, -1, 0, 0,
        0,  0, 1, 0,
        0,  0, 0, 1,
      ]

      expect(toMatrix(refXZ)).toEqual(expected)
    })

    it('inverts Y coordinate while keeping X and Z unchanged', () => {
      const matrix = toMatrix(refXZ)
      const result = transformPoint(matrix, [4, 7, -9])

      expect(result).toEqual([4, -7, -9])
    })
  })

  describe('plane xy (inverts Z)', () => {
    const refXY: Reflection = { type: 'reflection', plane: 'xy' }

    it('produces the expected reflection matrix across XY plane', () => {
      // prettier-ignore
      const expected = [
        1, 0,  0, 0,
        0, 1,  0, 0,
        0, 0, -1, 0,
        0, 0,  0, 1,
      ]

      expect(toMatrix(refXY)).toEqual(expected)
    })

    it('inverts Z coordinate while keeping X and Y unchanged', () => {
      const matrix = toMatrix(refXY)
      const result = transformPoint(matrix, [4, 7, -9])

      expect(result).toEqual([4, 7, 9])
    })
  })

  describe('involution property (Reflection · Reflection = I)', () => {
    it('returns point to its original position when applied twice', () => {
      for (const plane of ['xy', 'xz', 'yz'] as const) {
        const ref: Reflection = { type: 'reflection', plane }
        const matrix = toMatrix(ref)
        const doubleMatrix = multiply(matrix, matrix)

        expect(doubleMatrix).toEqual(identity())

        const p = [12, -34, 56] as const
        const reflectedOnce = transformPoint(matrix, p)
        const reflectedTwice = transformPoint(matrix, reflectedOnce)

        expect(reflectedTwice).toEqual(p)
      }
    })
  })
})
