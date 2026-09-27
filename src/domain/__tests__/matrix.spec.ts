import { describe, it, expect } from 'vitest'
import {
  identity,
  multiply,
  createMatrix,
  identityInto,
  multiplyInto,
  type Matrix4,
  type MutableMatrix4,
} from '../matrix'

describe('identity', () => {
  it('produces a 4x4 identity matrix in row-major order', () => {
    // prettier-ignore
    const expected = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ] as const

    const result = identity()

    expect(result).toEqual(expected)
  })
})

describe('multiply', () => {
  // prettier-ignore
  const sampleA: Matrix4 = [
    1, 2, 3, 4,
    5, 6, 7, 8,
    9, 1, 2, 3,
    4, 5, 6, 7,
  ]

  it('satisfies left identity: I · A = A', () => {
    expect(multiply(identity(), sampleA)).toEqual(sampleA)
  })

  it('satisfies right identity: A · I = A', () => {
    expect(multiply(sampleA, identity())).toEqual(sampleA)
  })

  it('multiplies two known matrices correctly without mutating inputs', () => {
    // prettier-ignore
    const a: Matrix4 = [
      1, 2, 0, 1,
      0, 1, 1, 0,
      2, 0, 1, 3,
      1, 1, 0, 2,
    ]
    // prettier-ignore
    const b: Matrix4 = [
      2, 1, 0, 1,
      1, 0, 2, 0,
      0, 3, 1, 1,
      1, 0, 0, 2,
    ]

    // prettier-ignore
    const expectedAB: Matrix4 = [
      5, 1, 4, 3,
      1, 3, 3, 1,
      7, 5, 1, 9,
      5, 1, 2, 5,
    ]

    const aClone = [...a]
    const bClone = [...b]

    const result = multiply(a, b)

    expect(result).toEqual(expectedAB)
    expect(a).toEqual(aClone)
    expect(b).toEqual(bClone)
  })

  it('preserves operation order: A · B ≠ B · A', () => {
    // prettier-ignore
    const a: Matrix4 = [
      1, 2, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]
    // prettier-ignore
    const b: Matrix4 = [
      1, 0, 0, 0,
      3, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]

    // a · b:
    // row 0: [1*1 + 2*3, 1*0 + 2*1, 0, 0] = [7, 2, 0, 0]
    // b · a:
    // row 0: [1*1 + 0*0, 1*2 + 0*1, 0, 0] = [1, 2, 0, 0]
    const ab = multiply(a, b)
    const ba = multiply(b, a)

    expect(ab).not.toEqual(ba)
    expect(ab[0]).toBe(7)
    expect(ba[0]).toBe(1)
  })
})

describe('createMatrix and identityInto', () => {
  it('createMatrix allocates a mutable 4x4 identity matrix', () => {
    const m = createMatrix()
    expect(m).toEqual(identity())
  })

  it('identityInto resets an existing matrix buffer to identity without allocating', () => {
    // prettier-ignore
    const out: MutableMatrix4 = [
      9, 9, 9, 9,
      9, 9, 9, 9,
      9, 9, 9, 9,
      9, 9, 9, 9,
    ]
    identityInto(out)
    expect(out).toEqual(identity())
  })
})

describe('multiplyInto', () => {
  // prettier-ignore
  const a: Matrix4 = [
    1, 2, 0, 1,
    0, 1, 1, 0,
    2, 0, 1, 3,
    1, 1, 0, 2,
  ]
  // prettier-ignore
  const b: Matrix4 = [
    2, 1, 0, 1,
    1, 0, 2, 0,
    0, 3, 1, 1,
    1, 0, 0, 2,
  ]
  // prettier-ignore
  const expectedAB: Matrix4 = [
    5, 1, 4, 3,
    1, 3, 3, 1,
    7, 5, 1, 9,
    5, 1, 2, 5,
  ]

  it('computes out = a · b into a separate caller-owned buffer', () => {
    const out: MutableMatrix4 = createMatrix()
    multiplyInto(out, a, b)
    expect(out).toEqual(expectedAB)
  })

  it('supports aliasing when out === a: multiplyInto(a, a, b)', () => {
    const mutatingA: MutableMatrix4 = [...a]
    multiplyInto(mutatingA, mutatingA, b)
    expect(mutatingA).toEqual(expectedAB)
  })

  it('supports aliasing when out === b: multiplyInto(b, a, b)', () => {
    const mutatingB: MutableMatrix4 = [...b]
    multiplyInto(mutatingB, a, mutatingB)
    expect(mutatingB).toEqual(expectedAB)
  })

  it('supports self-aliasing when out === a === b: multiplyInto(matrix, matrix, matrix)', () => {
    const mutating: MutableMatrix4 = [...a]
    const expectedSelf = multiply(a, a)
    multiplyInto(mutating, mutating, mutating)
    expect(mutating).toEqual(expectedSelf)
  })
})
