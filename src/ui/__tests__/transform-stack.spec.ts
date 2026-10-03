import { describe, expect, it } from 'vitest'
import type { Transform } from '../../domain/transform'
import {
  createDefaultTransform,
  degreesToRadians,
  formatMatrixValue,
  parseFiniteNumber,
  radiansToDegrees,
} from '../transform-stack'

describe('default transforms', () => {
  const defaults: Transform[] = [
    { type: 'translation', x: 0, y: 0, z: 0 },
    { type: 'rotation', axis: 'z', angle: 0 },
    { type: 'scale', x: 1, y: 1, z: 1 },
    { type: 'reflection', plane: 'yz' },
    { type: 'shear', kxy: 0, kxz: 0, kyx: 0, kyz: 0, kzx: 0, kzy: 0 },
  ]

  it.each(defaults)('creates the semantic default for $type', (expected) => {
    expect(createDefaultTransform(expected.type)).toEqual(expected)
  })

  it('creates independent transform objects', () => {
    for (const { type } of defaults) {
      const first = createDefaultTransform(type)
      const second = createDefaultTransform(type)
      expect(second).toEqual(first)
      expect(second).not.toBe(first)
    }
  })
})

describe('matrix value presentation', () => {
  it.each([
    [0, '0'],
    [-0, '0'],
    [Math.cos(Math.PI / 2), '0'],
    [-1e-12, '0'],
    [1, '1'],
    [1.25, '1.25'],
    [Math.PI, '3.1416'],
    [-1.23456789, '-1.2346'],
  ] as const)('formats %s as %s', (value, display) => {
    expect(formatMatrixValue(value)).toBe(display)
  })

  it('keeps full mathematical precision in the input matrix', () => {
    const matrix = [Math.PI, Math.cos(Math.PI / 2), -1.23456789]
    const before = [...matrix]

    expect(matrix.map(formatMatrixValue)).toEqual(['3.1416', '0', '-1.2346'])
    expect(matrix).toEqual(before)
  })
})

describe('rotation angle units', () => {
  it.each([
    [180, Math.PI],
    [90, Math.PI / 2],
    [-90, -Math.PI / 2],
    [0, 0],
  ])('converts %s degrees to %s radians', (degrees, radians) => {
    expect(degreesToRadians(degrees)).toBeCloseTo(radians, 12)
  })

  it.each([
    [Math.PI, 180],
    [Math.PI / 2, 90],
    [-Math.PI / 2, -90],
    [0, 0],
  ])('converts %s radians to %s degrees', (radians, degrees) => {
    expect(radiansToDegrees(radians)).toBeCloseTo(degrees, 12)
  })
})

describe('finite numeric input', () => {
  it.each(['', ' ', '\t\n', 'abc', 'NaN', 'Infinity', '-Infinity', '+Infinity', '-', '.', '1e309'])(
    'rejects %j without replacing it with zero',
    (value) => {
      expect(parseFiniteNumber(value)).toBeUndefined()
    },
  )

  it.each([
    ['0', 0],
    ['-5', -5],
    ['-0.25', -0.25],
    ['3.141592653589793', Math.PI],
    [' 2 ', 2],
    ['1e3', 1000],
    ['1.', 1],
  ] as const)('accepts %j as %s', (value, expected) => {
    expect(parseFiniteNumber(value)).toBe(expected)
  })
})
