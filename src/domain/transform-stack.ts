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

/** Writes the composition into out; pass a distinct scratch buffer to avoid allocation. */
export const composeTransformsInto = (
  out: MutableMatrix4,
  transforms: readonly Transform[],
  scratch: MutableMatrix4 = createMatrix(),
): void => {
  if (out === scratch) throw new Error('Output and scratch buffers must be distinct')
  identityInto(out)
  for (const transform of transforms) {
    toMatrixInto(scratch, transform)
    multiplyInto(out, scratch, out)
  }
}

/** Applies transforms in sequence: [T, R, S] composes to S · R · T. */
export const composeTransforms = (transforms: readonly Transform[]): Matrix4 => {
  const out = createMatrix()
  composeTransformsInto(out, transforms)
  return out
}

/** Stage 0 is identity; each subsequent stage applies the next transform. */
export const computeTransformStages = (transforms: readonly Transform[]): readonly Matrix4[] => {
  let matrix = identity()
  const stages = [matrix]
  for (const transform of transforms) {
    matrix = multiply(toMatrix(transform), matrix)
    stages.push(matrix)
  }
  return stages
}
