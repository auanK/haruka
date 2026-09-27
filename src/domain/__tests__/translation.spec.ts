import { describe, it, expect } from 'vitest'
import { identity } from '../matrix'
import { transformPoint } from '../point'
import { toMatrix, type Translation } from '../transform'

describe('Translation', () => {
  it('produces identity matrix for neutral translation T(0, 0, 0) = I', () => {
    const t: Translation = { type: 'translation', x: 0, y: 0, z: 0 }
    const matrix = toMatrix(t)

    expect(matrix).toEqual(identity())
  })

  it('produces exact matrix for known translation T(2, 3, 4)', () => {
    const t: Translation = { type: 'translation', x: 2, y: 3, z: 4 }
    // prettier-ignore
    const expected = [
      1, 0, 0, 2,
      0, 1, 0, 3,
      0, 0, 1, 4,
      0, 0, 0, 1,
    ]

    expect(toMatrix(t)).toEqual(expected)
  })

  it('transforms point correctly: T(2, 3, 4) · (1, 1, 1) = (3, 4, 5)', () => {
    const t: Translation = { type: 'translation', x: 2, y: 3, z: 4 }
    const matrix = toMatrix(t)
    const result = transformPoint(matrix, [1, 1, 1])

    expect(result).toEqual([3, 4, 5])
  })

  it('handles negative translation offsets correctly', () => {
    const t: Translation = { type: 'translation', x: -5, y: -2, z: -8 }
    const matrix = toMatrix(t)
    const result = transformPoint(matrix, [10, 5, 0])

    expect(result).toEqual([5, 3, -8])
  })
})
