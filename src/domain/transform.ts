import { createMatrix, type Matrix4, type MutableMatrix4 } from './matrix'

export type Translation = {
  readonly type: 'translation'
  readonly x: number
  readonly y: number
  readonly z: number
}

export type Scale = {
  readonly type: 'scale'
  readonly x: number
  readonly y: number
  readonly z: number
}

export type RotationAxis = 'x' | 'y' | 'z'

export type Rotation = {
  readonly type: 'rotation'
  readonly axis: RotationAxis
  readonly angle: number // radians
}

export type ReflectionPlane = 'xy' | 'xz' | 'yz'

export type Reflection = {
  readonly type: 'reflection'
  readonly plane: ReflectionPlane
}

/**
 * 3D Shear transformation with six independent coefficients:
 * kij denotes the shear contribution of coordinate j along axis i.
 * - kxy: Y contribution to X
 * - kxz: Z contribution to X
 * - kyx: X contribution to Y
 * - kyz: Z contribution to Y
 * - kzx: X contribution to Z
 * - kzy: Y contribution to Z
 */
export type Shear = {
  readonly type: 'shear'
  readonly kxy: number
  readonly kxz: number
  readonly kyx: number
  readonly kyz: number
  readonly kzx: number
  readonly kzy: number
}

export type Transform = Translation | Scale | Rotation | Reflection | Shear

const assertNever = (value: never): never => {
  throw new Error(`Unhandled transform: ${JSON.stringify(value)}`)
}

/**
 * Writes the 4x4 row-major matrix of a semantic transformation directly
 * into a caller-owned output buffer, avoiding allocation.
 */
export const toMatrixInto = (out: MutableMatrix4, transform: Transform): void => {
  switch (transform.type) {
    case 'translation':
      // prettier-ignore
      {
        out[0]  = 1; out[1]  = 0; out[2]  = 0; out[3]  = transform.x
        out[4]  = 0; out[5]  = 1; out[6]  = 0; out[7]  = transform.y
        out[8]  = 0; out[9]  = 0; out[10] = 1; out[11] = transform.z
        out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1
      }
      return

    case 'scale':
      // prettier-ignore
      {
        out[0]  = transform.x; out[1]  = 0;           out[2]  = 0;           out[3]  = 0
        out[4]  = 0;           out[5]  = transform.y; out[6]  = 0;           out[7]  = 0
        out[8]  = 0;           out[9]  = 0;           out[10] = transform.z; out[11] = 0
        out[12] = 0;           out[13] = 0;           out[14] = 0;           out[15] = 1
      }
      return

    case 'rotation': {
      const cos = Math.cos(transform.angle)
      const sin = Math.sin(transform.angle)
      switch (transform.axis) {
        case 'x':
          // prettier-ignore
          {
            out[0]  = 1; out[1]  = 0;   out[2]  = 0;    out[3]  = 0
            out[4]  = 0; out[5]  = cos; out[6]  = -sin; out[7]  = 0
            out[8]  = 0; out[9]  = sin; out[10] = cos;  out[11] = 0
            out[12] = 0; out[13] = 0;   out[14] = 0;    out[15] = 1
          }
          return
        case 'y':
          // prettier-ignore
          {
            out[0]  = cos;  out[1]  = 0; out[2]  = sin; out[3]  = 0
            out[4]  = 0;    out[5]  = 1; out[6]  = 0;   out[7]  = 0
            out[8]  = -sin; out[9]  = 0; out[10] = cos; out[11] = 0
            out[12] = 0;    out[13] = 0; out[14] = 0;   out[15] = 1
          }
          return
        case 'z':
          // prettier-ignore
          {
            out[0]  = cos; out[1]  = -sin; out[2]  = 0; out[3]  = 0
            out[4]  = sin; out[5]  = cos;  out[6]  = 0; out[7]  = 0
            out[8]  = 0;   out[9]  = 0;    out[10] = 1; out[11] = 0
            out[12] = 0;   out[13] = 0;    out[14] = 0; out[15] = 1
          }
          return
        default:
          return assertNever(transform.axis)
      }
    }

    case 'reflection':
      switch (transform.plane) {
        case 'yz':
          // prettier-ignore
          {
            out[0]  = -1; out[1]  = 0; out[2]  = 0; out[3]  = 0
            out[4]  = 0;  out[5]  = 1; out[6]  = 0; out[7]  = 0
            out[8]  = 0;  out[9]  = 0; out[10] = 1; out[11] = 0
            out[12] = 0;  out[13] = 0; out[14] = 0; out[15] = 1
          }
          return
        case 'xz':
          // prettier-ignore
          {
            out[0]  = 1; out[1]  = 0;  out[2]  = 0; out[3]  = 0
            out[4]  = 0; out[5]  = -1; out[6]  = 0; out[7]  = 0
            out[8]  = 0; out[9]  = 0;  out[10] = 1; out[11] = 0
            out[12] = 0; out[13] = 0;  out[14] = 0; out[15] = 1
          }
          return
        case 'xy':
          // prettier-ignore
          {
            out[0]  = 1; out[1]  = 0; out[2]  = 0;  out[3]  = 0
            out[4]  = 0; out[5]  = 1; out[6]  = 0;  out[7]  = 0
            out[8]  = 0; out[9]  = 0; out[10] = -1; out[11] = 0
            out[12] = 0; out[13] = 0; out[14] = 0;  out[15] = 1
          }
          return
        default:
          return assertNever(transform.plane)
      }

    case 'shear':
      // prettier-ignore
      {
        out[0]  = 1;             out[1]  = transform.kxy; out[2]  = transform.kxz; out[3]  = 0
        out[4]  = transform.kyx; out[5]  = 1;             out[6]  = transform.kyz; out[7]  = 0
        out[8]  = transform.kzx; out[9]  = transform.kzy; out[10] = 1;             out[11] = 0
        out[12] = 0;             out[13] = 0;             out[14] = 0;             out[15] = 1
      }
      return

    default:
      return assertNever(transform)
  }
}

/**
 * Converts a semantic transformation into a 4x4 affine matrix in row-major order.
 * Convenient allocating API.
 */
export const toMatrix = (transform: Transform): Matrix4 => {
  const out = createMatrix()
  toMatrixInto(out, transform)
  return out
}
