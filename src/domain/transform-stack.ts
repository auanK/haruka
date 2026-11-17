import {
  createMatrix,
  identity,
  identityInto,
  multiply,
  multiplyInto,
  type Matrix4,
  type MutableMatrix4,
} from './matrix'
import { toMatrix, toMatrixInto, type Transform } from './transform'

/** Semantic operations may be surrounded by exact, read-only coordinate frames. */
export type TransformFactor = Transform | Matrix4

export const factorMatrix = (factor: TransformFactor): Matrix4 =>
  'type' in factor ? toMatrix(factor) : factor

/** Writes the composition into out; pass a distinct scratch buffer to avoid allocation. */
export const composeTransformsInto = (
  out: MutableMatrix4,
  transforms: readonly TransformFactor[],
  scratch: MutableMatrix4 = createMatrix(),
): void => {
  if (out === scratch) throw new Error('Output and scratch buffers must be distinct')
  identityInto(out)
  for (const transform of transforms) {
    if ('type' in transform) toMatrixInto(scratch, transform)
    else for (let i = 0; i < 16; i++) scratch[i] = transform[i]!
    multiplyInto(out, scratch, out)
  }
}

/** Applies transforms in sequence: [T, R, S] composes to S · R · T. */
export const composeTransforms = (transforms: readonly TransformFactor[]): Matrix4 => {
  const out = createMatrix()
  composeTransformsInto(out, transforms)
  return out
}

/** Stage 0 is identity; each subsequent stage applies the next transform. */
export const computeTransformStages = (
  transforms: readonly TransformFactor[],
): readonly Matrix4[] => {
  let matrix = identity()
  const stages = [matrix]
  for (const transform of transforms) {
    matrix = multiply(factorMatrix(transform), matrix)
    stages.push(matrix)
  }
  return stages
}
