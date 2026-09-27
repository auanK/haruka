/**
 * 4x4 matrix represented logically in row-major order:
 * [
 *   m00, m01, m02, m03,
 *   m10, m11, m12, m13,
 *   m20, m21, m22, m23,
 *   m30, m31, m32, m33,
 * ]
 * Vectors are treated as column vectors: v' = M · v.
 */
// prettier-ignore
export type Matrix4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

/**
 * Mutable 4x4 matrix buffer for zero-allocation hot paths.
 */
// prettier-ignore
export type MutableMatrix4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

// prettier-ignore
export const identity = (): Matrix4 => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

/**
 * Allocates a mutable 4x4 matrix initialized to the identity.
 */
// prettier-ignore
export const createMatrix = (): MutableMatrix4 => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

/**
 * Sets all 16 elements of a 4x4 matrix buffer in row-major order.
 */
// prettier-ignore
const setMatrixElements = (
  out: MutableMatrix4,
  m00: number, m01: number, m02: number, m03: number,
  m10: number, m11: number, m12: number, m13: number,
  m20: number, m21: number, m22: number, m23: number,
  m30: number, m31: number, m32: number, m33: number,
): void => {
  out[0] = m00
  out[1] = m01
  out[2] = m02
  out[3] = m03
  out[4] = m10
  out[5] = m11
  out[6] = m12
  out[7] = m13
  out[8] = m20
  out[9] = m21
  out[10] = m22
  out[11] = m23
  out[12] = m30
  out[13] = m31
  out[14] = m32
  out[15] = m33
}

/**
 * Resets an existing matrix buffer to identity without allocating.
 */
export const identityInto = (out: MutableMatrix4): void => {
  // prettier-ignore
  setMatrixElements(
    out,
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  )
}

/**
 * Computes out = a · b in row-major order into a caller-owned buffer.
 * Loads matrix components into local variables first, ensuring safety
 * when out aliases either input matrix (out === a or out === b).
 */
export const multiplyInto = (out: MutableMatrix4, a: Matrix4, b: Matrix4): void => {
  // prettier-ignore
  const
    a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!,
    a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!,
    a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!,
    a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!

  // prettier-ignore
  const
    b00 = b[0]!, b01 = b[1]!, b02 = b[2]!, b03 = b[3]!,
    b10 = b[4]!, b11 = b[5]!, b12 = b[6]!, b13 = b[7]!,
    b20 = b[8]!, b21 = b[9]!, b22 = b[10]!, b23 = b[11]!,
    b30 = b[12]!, b31 = b[13]!, b32 = b[14]!, b33 = b[15]!

  // prettier-ignore
  setMatrixElements(
    out,
    a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30,
    a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31,
    a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32,
    a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33,

    a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30,
    a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31,
    a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32,
    a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33,

    a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30,
    a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31,
    a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32,
    a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33,

    a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30,
    a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31,
    a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32,
    a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33,
  )
}

/**
 * Multiplies two 4x4 matrices in row-major order: result = a · b.
 * Convenient allocating API; does not mutate either input matrix.
 */
// prettier-ignore
export const multiply = (a: Matrix4, b: Matrix4): Matrix4 => [
  // row 0
  a[0]! * b[0]! + a[1]! * b[4]! + a[2]! * b[8]! + a[3]! * b[12]!,
  a[0]! * b[1]! + a[1]! * b[5]! + a[2]! * b[9]! + a[3]! * b[13]!,
  a[0]! * b[2]! + a[1]! * b[6]! + a[2]! * b[10]! + a[3]! * b[14]!,
  a[0]! * b[3]! + a[1]! * b[7]! + a[2]! * b[11]! + a[3]! * b[15]!,

  // row 1
  a[4]! * b[0]! + a[5]! * b[4]! + a[6]! * b[8]! + a[7]! * b[12]!,
  a[4]! * b[1]! + a[5]! * b[5]! + a[6]! * b[9]! + a[7]! * b[13]!,
  a[4]! * b[2]! + a[5]! * b[6]! + a[6]! * b[10]! + a[7]! * b[14]!,
  a[4]! * b[3]! + a[5]! * b[7]! + a[6]! * b[11]! + a[7]! * b[15]!,

  // row 2
  a[8]! * b[0]! + a[9]! * b[4]! + a[10]! * b[8]! + a[11]! * b[12]!,
  a[8]! * b[1]! + a[9]! * b[5]! + a[10]! * b[9]! + a[11]! * b[13]!,
  a[8]! * b[2]! + a[9]! * b[6]! + a[10]! * b[10]! + a[11]! * b[14]!,
  a[8]! * b[3]! + a[9]! * b[7]! + a[10]! * b[11]! + a[11]! * b[15]!,

  // row 3
  a[12]! * b[0]! + a[13]! * b[4]! + a[14]! * b[8]! + a[15]! * b[12]!,
  a[12]! * b[1]! + a[13]! * b[5]! + a[14]! * b[9]! + a[15]! * b[13]!,
  a[12]! * b[2]! + a[13]! * b[6]! + a[14]! * b[10]! + a[15]! * b[14]!,
  a[12]! * b[3]! + a[13]! * b[7]! + a[14]! * b[11]! + a[15]! * b[15]!,
]
