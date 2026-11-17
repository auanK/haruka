import { type Matrix4, type Point3 } from '../domain'

export type Basis3 = readonly [Point3, Point3, Point3]
export const worldBasis: Basis3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]
export const dot3 = (a: Point3, b: Point3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross3 = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const scale3 = (a: Point3, n: number): Point3 => [a[0] * n, a[1] * n, a[2] * n]
export const normalize3 = (a: Point3, fallback: Point3 = [1, 0, 0]): Point3 => {
  const length = Math.hypot(...a)
  return length > 1e-10 && Number.isFinite(length) ? scale3(a, 1 / length) : fallback
}

/** An orthonormal local frame, independent of scale and shear in the composed matrix. */
export const deriveLocalBasis = (m: Matrix4): Basis3 => {
  const x = normalize3([m[0], m[4], m[8]])
  const columnY: Point3 = [m[1], m[5], m[9]]
  const projection = dot3(columnY, x)
  const fallback = Math.abs(x[1]) < 0.9 ? cross3([0, 1, 0], x) : cross3([0, 0, 1], x)
  const y = normalize3(
    [
      columnY[0] - projection * x[0],
      columnY[1] - projection * x[1],
      columnY[2] - projection * x[2],
    ],
    normalize3(fallback),
  )
  return [x, y, normalize3(cross3(x, y), [0, 0, 1])]
}

export const basisMatrix = (basis: Basis3, inverse = false): Matrix4 => {
  const [x, y, z] = basis
  return inverse
    ? [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]
    : [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, 0, 0, 0, 1]
}
