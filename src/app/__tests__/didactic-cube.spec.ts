import { describe, expect, it } from 'vitest'
import { composeTransforms, identity, toMatrix, type Transform } from '../../domain'
import { cubeVertices, transformCubeVertices } from '../didactic-cube'

describe('didactic cube', () => {
  it('defines exactly V1…V8 as a unit cube centered at the origin in the stable convention', () => {
    expect(cubeVertices).toEqual([
      { id: 'V1', point: [-0.5, -0.5, -0.5] },
      { id: 'V2', point: [0.5, -0.5, -0.5] },
      { id: 'V3', point: [0.5, 0.5, -0.5] },
      { id: 'V4', point: [-0.5, 0.5, -0.5] },
      { id: 'V5', point: [-0.5, -0.5, 0.5] },
      { id: 'V6', point: [0.5, -0.5, 0.5] },
      { id: 'V7', point: [0.5, 0.5, 0.5] },
      { id: 'V8', point: [-0.5, 0.5, 0.5] },
    ])
    expect(cubeVertices).toHaveLength(8)
    expect(new Set(cubeVertices.map(({ id }) => id)).size).toBe(8)
    expect(cubeVertices.every(({ point }) => point.every((value) => Math.abs(value) === 0.5))).toBe(
      true,
    )
    for (const coordinate of [0, 1, 2] as const) {
      expect(cubeVertices.reduce((sum, { point }) => sum + point[coordinate], 0)).toBe(0)
    }
  })

  it('derives the base coordinates under identity without sharing mutable point buffers', () => {
    const vertices = transformCubeVertices(identity())
    expect(vertices).toEqual(cubeVertices)
    expect(vertices).not.toBe(cubeVertices)
    for (const [index, vertex] of vertices.entries()) {
      expect(vertex.point).not.toBe(cubeVertices[index]!.point)
    }
  })

  it('translates all eight vertices while preserving their IDs', () => {
    const matrix = toMatrix({ type: 'translation', x: 2, y: 3, z: 4 })
    expect(transformCubeVertices(matrix)).toEqual([
      { id: 'V1', point: [1.5, 2.5, 3.5] },
      { id: 'V2', point: [2.5, 2.5, 3.5] },
      { id: 'V3', point: [2.5, 3.5, 3.5] },
      { id: 'V4', point: [1.5, 3.5, 3.5] },
      { id: 'V5', point: [1.5, 2.5, 4.5] },
      { id: 'V6', point: [2.5, 2.5, 4.5] },
      { id: 'V7', point: [2.5, 3.5, 4.5] },
      { id: 'V8', point: [1.5, 3.5, 4.5] },
    ])
  })

  it('changes vertex coordinates when non-commuting transforms are reordered', () => {
    const translation: Transform = { type: 'translation', x: 2, y: 0, z: 0 }
    const rotation: Transform = { type: 'rotation', axis: 'z', angle: Math.PI / 2 }
    const before = transformCubeVertices(composeTransforms([translation, rotation]))
    const after = transformCubeVertices(composeTransforms([rotation, translation]))
    expect(before.map(({ id }) => id)).toEqual(after.map(({ id }) => id))
    expect(before[0]!.point[0]).toBeCloseTo(0.5)
    expect(before[0]!.point[1]).toBeCloseTo(1.5)
    expect(after[0]!.point[0]).toBeCloseTo(2.5)
    expect(after[0]!.point[1]).toBeCloseTo(-0.5)
    expect(before[0]!.point[2]).toBe(-0.5)
    expect(after[0]!.point[2]).toBe(-0.5)
  })

  it('does not mutate frozen base vertices or the input matrix', () => {
    const original = cubeVertices.map(({ id, point }) => ({ id, point: [...point] }))
    for (const vertex of cubeVertices) {
      Object.freeze(vertex.point)
      Object.freeze(vertex)
    }
    Object.freeze(cubeVertices)
    const matrix = Object.freeze(toMatrix({ type: 'scale', x: -2, y: 3, z: 0.5 }))
    const snapshot = [...matrix]
    expect(transformCubeVertices(matrix)[0]).toEqual({ id: 'V1', point: [1, -1.5, -0.25] })
    expect(matrix).toEqual(snapshot)
    expect(cubeVertices).toEqual(original)
  })
})
