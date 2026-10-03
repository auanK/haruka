import { describe, expect, it } from 'vitest'
import { toMatrix, type Transform } from '../../domain'
import { deriveTransformMatrixCells } from '../transform-matrix'
import { formatMatrixValue } from '../transform-stack'

describe('semantic matrix cell presentation', () => {
  it.each([
    {
      transform: { type: 'translation', x: 2, y: 3, z: 4 },
      fields: [
        [3, 'x', 2],
        [7, 'y', 3],
        [11, 'z', 4],
      ],
    },
    {
      transform: { type: 'scale', x: 0, y: -2.5, z: 4 },
      fields: [
        [0, 'x', 0],
        [5, 'y', -2.5],
        [10, 'z', 4],
      ],
    },
    {
      transform: { type: 'shear', kxy: 1, kxz: 2, kyx: 3, kyz: 4, kzx: 5, kzy: 6 },
      fields: [
        [1, 'kxy', 1],
        [2, 'kxz', 2],
        [4, 'kyx', 3],
        [6, 'kyz', 4],
        [8, 'kzx', 5],
        [9, 'kzy', 6],
      ],
    },
  ] as const)(
    'restricts $transform.type to its semantic numeric cells',
    ({ transform, fields }) => {
      Object.freeze(transform)
      const cells = deriveTransformMatrixCells(transform)
      expect(cells).toHaveLength(16)
      expect(cells.map((cell) => cell.index)).toEqual(
        Array.from({ length: 16 }, (_, index) => index),
      )
      const editable = cells.filter((cell) => cell.kind === 'number')
      expect(editable.map((cell) => [cell.index, cell.field, cell.value])).toEqual(fields)
      for (const cell of editable) expect(cell.label).toContain('matrix cell')
      const matrix = toMatrix(transform)
      for (const cell of cells.filter((cell) => cell.kind === 'readonly')) {
        expect(cell.text).toBe(formatMatrixValue(matrix[cell.index]!))
      }
      expect(cells.filter((cell) => cell.kind !== 'readonly')).toHaveLength(fields.length)
    },
  )

  it.each([
    ['yz', ['-1', '1', '1']],
    ['xz', ['1', '-1', '1']],
    ['xy', ['1', '1', '-1']],
  ] as const)('presents %s reflection as three exclusive diagonal choices', (plane, diagonal) => {
    const cells = deriveTransformMatrixCells({ type: 'reflection', plane })
    const choices = cells.filter((cell) => cell.kind === 'reflection')
    expect(choices.map((cell) => cell.index)).toEqual([0, 5, 10])
    expect(choices.map((cell) => cell.plane)).toEqual(['yz', 'xz', 'xy'])
    expect(choices.map((cell) => cell.text)).toEqual(diagonal)
    expect(choices.filter((cell) => cell.active).map((cell) => cell.plane)).toEqual([plane])
    expect(choices.map((cell) => cell.label)).toEqual([
      'Reflect across YZ',
      'Reflect across XZ',
      'Reflect across XY',
    ])
    expect(cells.filter((cell) => cell.kind === 'readonly')).toHaveLength(13)
  })

  it.each([
    [
      'x',
      [
        [5, 'cos(90°)'],
        [6, '-sen(90°)'],
        [9, 'sen(90°)'],
        [10, 'cos(90°)'],
      ],
    ],
    [
      'y',
      [
        [0, 'cos(90°)'],
        [2, 'sen(90°)'],
        [8, '-sen(90°)'],
        [10, 'cos(90°)'],
      ],
    ],
    [
      'z',
      [
        [0, 'cos(90°)'],
        [1, '-sen(90°)'],
        [4, 'sen(90°)'],
        [5, 'cos(90°)'],
      ],
    ],
  ] as const)('uses the existing %s rotation convention symbolically', (axis, expected) => {
    const transform = Object.freeze({ type: 'rotation', axis, angle: Math.PI / 2 } as const)
    const cells = deriveTransformMatrixCells(transform)
    const symbolic = cells.filter((cell) => cell.kind === 'rotation')
    expect(symbolic.map((cell) => [cell.index, cell.text])).toEqual(expected)
    expect(symbolic.every((cell) => cell.degrees === 90)).toBe(true)
    expect(cells.filter((cell) => cell.kind === 'readonly')).toHaveLength(12)
    expect(transform.angle).toBe(Math.PI / 2)

    const arbitrary: Transform = { ...transform, angle: 0.713 }
    const matrix = toMatrix(arbitrary)
    for (const cell of deriveTransformMatrixCells(arbitrary)) {
      if (cell.kind !== 'rotation') continue
      const value =
        cell.expression === 'cos'
          ? Math.cos(arbitrary.angle)
          : Math.sin(arbitrary.angle) * (cell.expression === '-sen' ? -1 : 1)
      expect(value).toBe(matrix[cell.index])
    }
  })

  it('formats angle presentation without storing or rounding the domain angle', () => {
    const transform = Object.freeze({ type: 'rotation', axis: 'z', angle: Math.PI / 6 } as const)
    expect(deriveTransformMatrixCells(transform)[0]!.text).toBe('cos(30°)')
    expect(transform.angle).toBe(Math.PI / 6)
  })
})
