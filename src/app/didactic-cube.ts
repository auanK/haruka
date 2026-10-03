import { transformPoint, type Matrix4, type Point3 } from '../domain'

export type CubeVertexId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8'

export type CubeVertex = {
  readonly id: CubeVertexId
  readonly point: Point3
}

/** Stable unit cube: V1…V4 on z = −0.5; matching V5…V8 on z = +0.5. */
export const cubeVertices: readonly CubeVertex[] = [
  { id: 'V1', point: [-0.5, -0.5, -0.5] },
  { id: 'V2', point: [0.5, -0.5, -0.5] },
  { id: 'V3', point: [0.5, 0.5, -0.5] },
  { id: 'V4', point: [-0.5, 0.5, -0.5] },
  { id: 'V5', point: [-0.5, -0.5, 0.5] },
  { id: 'V6', point: [0.5, -0.5, 0.5] },
  { id: 'V7', point: [0.5, 0.5, 0.5] },
  { id: 'V8', point: [-0.5, 0.5, 0.5] },
]

export const transformCubeVertices = (matrix: Matrix4): readonly CubeVertex[] =>
  cubeVertices.map(({ id, point }) => ({ id, point: transformPoint(matrix, point) }))
