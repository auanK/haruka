import type { Matrix4 as ThreeMatrix4, Object3D } from 'three'
import { getTransformSequence, type TransformStackState } from '../app/transform-stack-state'
import { composeTransforms, type Matrix4 as HarukaMatrix4 } from '../domain'

/** Writes Haruka's logical row-major values into a caller-owned Three.js matrix. */
export const writeThreeMatrix = (out: ThreeMatrix4, matrix: HarukaMatrix4): void => {
  out.set(...matrix)
}

/** Overwrites derived local state while leaving world propagation to Three.js. */
export const applyHarukaMatrixToObject = (object: Object3D, matrix: HarukaMatrix4): void => {
  object.matrixAutoUpdate = false
  writeThreeMatrix(object.matrix, matrix)
  object.matrixWorldNeedsUpdate = true
}

export const applyTransformStackStateToObject = (
  object: Object3D,
  state: TransformStackState,
): void => {
  applyHarukaMatrixToObject(object, composeTransforms(getTransformSequence(state)))
}
