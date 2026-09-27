import { describe, it, expect } from 'vitest'
import { identity, type Matrix4 } from '../matrix'
import { transformPoint, type Point3 } from '../point'

describe('transformPoint', () => {
  it('preserves the point when transformed by identity matrix: I · p = p', () => {
    const p: Point3 = [3, -5, 7]
    const pClone = [...p]
    const result = transformPoint(identity(), p)

    expect(result).toEqual([3, -5, 7])
    expect(p).toEqual(pClone)
  })

  it('transforms point correctly with a known affine matrix as a column vector [x, y, z, 1]ᵀ', () => {
    // M · [x, y, z, 1]ᵀ
    // row 0: 2*x + 1*y + 0*z + 4*1
    // row 1: 0*x + 3*y + 1*z - 2*1
    // row 2: 1*x + 0*y + 2*z + 5*1
    const m: Matrix4 = [2, 1, 0, 4, 0, 3, 1, -2, 1, 0, 2, 5, 0, 0, 0, 1]
    const p: Point3 = [1, 2, 3]

    // x' = 2(1) + 1(2) + 0(3) + 4 = 2 + 2 + 0 + 4 = 8
    // y' = 0(1) + 3(2) + 1(3) - 2 = 0 + 6 + 3 - 2 = 7
    // z' = 1(1) + 0(2) + 2(3) + 5 = 1 + 0 + 6 + 5 = 12
    const result = transformPoint(m, p)

    expect(result).toEqual([8, 7, 12])
  })
})
