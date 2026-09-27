import type { Matrix4 } from './matrix'

/**
 * 3D point represented as a 3-element tuple [x, y, z].
 */
export type Point3 = readonly [number, number, number]

/**
 * Transforms a 3D point treated as a homogeneous column vector [x, y, z, 1]ᵀ:
 * p' = M · p
 * Does not mutate the input point.
 */
export const transformPoint = (m: Matrix4, p: Point3): Point3 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
]
