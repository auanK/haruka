import { describe, it, expect } from 'vitest'
import { type MutableMatrix4 } from '../matrix'
import { toMatrix, toMatrixInto, type Transform } from '../transform'

describe('toMatrixInto', () => {
  // prettier-ignore
  const garbageBuffer = (): MutableMatrix4 => [
    99, 99, 99, 99,
    99, 99, 99, 99,
    99, 99, 99, 99,
    99, 99, 99, 99,
  ]

  it('completely overwrites all 16 elements of a contaminated buffer for Translation', () => {
    const t: Transform = { type: 'translation', x: 2, y: -3, z: 5 }
    const out = garbageBuffer()
    // prettier-ignore
    const expected = [
      1, 0, 0,  2,
      0, 1, 0, -3,
      0, 0, 1,  5,
      0, 0, 0,  1,
    ]

    toMatrixInto(out, t)

    expect(out).toEqual(expected)
  })

  it('completely overwrites all 16 elements of a contaminated buffer for Scale', () => {
    const s: Transform = { type: 'scale', x: 2, y: 3, z: 4 }
    const out = garbageBuffer()
    // prettier-ignore
    const expected = [
      2, 0, 0, 0,
      0, 3, 0, 0,
      0, 0, 4, 0,
      0, 0, 0, 1,
    ]

    toMatrixInto(out, s)

    expect(out).toEqual(expected)
  })

  it('completely overwrites all 16 elements of a contaminated buffer for Rotation', () => {
    const r: Transform = { type: 'rotation', axis: 'z', angle: Math.PI / 2 }
    const out = garbageBuffer()

    toMatrixInto(out, r)

    expect(out[0]).toBeCloseTo(0, 5)
    expect(out[1]).toBeCloseTo(-1, 5)
    expect(out[2]).toBeCloseTo(0, 5)
    expect(out[3]).toBeCloseTo(0, 5)

    expect(out[4]).toBeCloseTo(1, 5)
    expect(out[5]).toBeCloseTo(0, 5)
    expect(out[6]).toBeCloseTo(0, 5)
    expect(out[7]).toBeCloseTo(0, 5)

    expect(out[8]).toBeCloseTo(0, 5)
    expect(out[9]).toBeCloseTo(0, 5)
    expect(out[10]).toBeCloseTo(1, 5)
    expect(out[11]).toBeCloseTo(0, 5)

    expect(out[12]).toBeCloseTo(0, 5)
    expect(out[13]).toBeCloseTo(0, 5)
    expect(out[14]).toBeCloseTo(0, 5)
    expect(out[15]).toBeCloseTo(1, 5)
  })

  it('completely overwrites all 16 elements of a contaminated buffer for Reflection', () => {
    const ref: Transform = { type: 'reflection', plane: 'yz' }
    const out = garbageBuffer()
    // prettier-ignore
    const expected = [
      -1, 0, 0, 0,
       0, 1, 0, 0,
       0, 0, 1, 0,
       0, 0, 0, 1,
    ]

    toMatrixInto(out, ref)

    expect(out).toEqual(expected)
  })

  it('completely overwrites all 16 elements of a contaminated buffer for Shear', () => {
    const sh: Transform = {
      type: 'shear',
      kxy: 2,
      kxz: 0,
      kyx: 0,
      kyz: 3,
      kzx: 0,
      kzy: 0,
    }
    const out = garbageBuffer()
    // prettier-ignore
    const expected = [
      1, 2, 0, 0,
      0, 1, 3, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]

    toMatrixInto(out, sh)

    expect(out).toEqual(expected)
  })

  it('toMatrix delegates to toMatrixInto and returns a clean Matrix4', () => {
    const t: Transform = { type: 'translation', x: 10, y: 20, z: 30 }
    const result = toMatrix(t)
    // prettier-ignore
    const expected = [
      1, 0, 0, 10,
      0, 1, 0, 20,
      0, 0, 1, 30,
      0, 0, 0,  1,
    ]

    expect(result).toEqual(expected)
  })
})
