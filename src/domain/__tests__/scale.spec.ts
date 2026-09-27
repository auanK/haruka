import { describe, it, expect } from 'vitest'
import { identity } from '../matrix'
import { transformPoint } from '../point'
import { toMatrix, type Scale } from '../transform'

describe('Scale', () => {
  it('produces identity matrix for neutral scale S(1, 1, 1) = I', () => {
    const s: Scale = { type: 'scale', x: 1, y: 1, z: 1 }
    const matrix = toMatrix(s)

    expect(matrix).toEqual(identity())
  })

  it('produces exact matrix for known scale S(2, 3, 4)', () => {
    const s: Scale = { type: 'scale', x: 2, y: 3, z: 4 }
    // prettier-ignore
    const expected = [
      2, 0, 0, 0,
      0, 3, 0, 0,
      0, 0, 4, 0,
      0, 0, 0, 1,
    ]

    expect(toMatrix(s)).toEqual(expected)
  })

  it('transforms point correctly: S(2, 3, 4) · (1, 2, 3) = (2, 6, 12)', () => {
    const s: Scale = { type: 'scale', x: 2, y: 3, z: 4 }
    const matrix = toMatrix(s)
    const result = transformPoint(matrix, [1, 2, 3])

    expect(result).toEqual([2, 6, 12])
  })

  it('handles negative scale factors (reflection-like behavior)', () => {
    const s: Scale = { type: 'scale', x: -1, y: 2, z: -3 }
    const matrix = toMatrix(s)
    const result = transformPoint(matrix, [5, 4, 3])

    expect(result).toEqual([-5, 8, -9])
  })

  it('allows zero scale factors and collapses the corresponding axis', () => {
    const s: Scale = { type: 'scale', x: 0, y: 1, z: 1 }
    const matrix = toMatrix(s)
    const result = transformPoint(matrix, [5, 4, 3])

    expect(result).toEqual([0, 4, 3])
  })
})
