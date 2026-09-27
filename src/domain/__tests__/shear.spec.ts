import { describe, it, expect } from 'vitest'
import { identity } from '../matrix'
import { transformPoint } from '../point'
import { toMatrix, type Shear } from '../transform'

describe('Shear', () => {
  it('produces identity matrix when all six shear coefficients are zero: Shear(0,0,0,0,0,0) = I', () => {
    const s: Shear = {
      type: 'shear',
      kxy: 0,
      kxz: 0,
      kyx: 0,
      kyz: 0,
      kzx: 0,
      kzy: 0,
    }

    expect(toMatrix(s)).toEqual(identity())
  })

  it('shears along X proportional to Y (kxy = 2) while keeping other coordinates independent', () => {
    // x' = x + 2*y
    // y' = y
    // z' = z
    const s: Shear = {
      type: 'shear',
      kxy: 2,
      kxz: 0,
      kyx: 0,
      kyz: 0,
      kzx: 0,
      kzy: 0,
    }

    // prettier-ignore
    const expectedMatrix = [
      1, 2, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]

    expect(toMatrix(s)).toEqual(expectedMatrix)

    const point = [3, 4, 5] as const
    // x' = 3 + 2*4 = 11, y' = 4, z' = 5
    expect(transformPoint(toMatrix(s), point)).toEqual([11, 4, 5])
  })

  it('shears along Y proportional to Z (kyz = 3) independently', () => {
    const s: Shear = {
      type: 'shear',
      kxy: 0,
      kxz: 0,
      kyx: 0,
      kyz: 3,
      kzx: 0,
      kzy: 0,
    }
    const point = [2, 5, 4] as const
    // y' = 5 + 3*4 = 17, x' = 2, z' = 4
    expect(transformPoint(toMatrix(s), point)).toEqual([2, 17, 4])
  })

  it('shears along Z proportional to X (kzx = -1) independently', () => {
    const s: Shear = {
      type: 'shear',
      kxy: 0,
      kxz: 0,
      kyx: 0,
      kyz: 0,
      kzx: -1,
      kzy: 0,
    }
    const point = [6, 2, 1] as const
    // z' = 1 + (-1)*6 = -5, x' = 6, y' = 2
    expect(transformPoint(toMatrix(s), point)).toEqual([6, 2, -5])
  })

  it('applies multiple simultaneous shear coefficients correctly', () => {
    const s: Shear = {
      type: 'shear',
      kxy: 1,
      kxz: 2,
      kyx: 0.5,
      kyz: -1,
      kzx: 3,
      kzy: 2,
    }

    // prettier-ignore
    const expectedMatrix = [
        1, 1,  2, 0,
      0.5, 1, -1, 0,
        3, 2,  1, 0,
        0, 0,  0, 1,
    ]

    expect(toMatrix(s)).toEqual(expectedMatrix)

    const p = [1, 2, 3] as const
    // x' = 1 + 1*2 + 2*3 = 1 + 2 + 6 = 9
    // y' = 0.5*1 + 2 + (-1)*3 = 0.5 + 2 - 3 = -0.5
    // z' = 3*1 + 2*2 + 3 = 3 + 4 + 3 = 10
    expect(transformPoint(toMatrix(s), p)).toEqual([9, -0.5, 10])
  })
})
