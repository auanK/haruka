import {
  composeTransforms,
  identity,
  multiply,
  factorMatrix,
  type Transform,
  type TransformFactor,
  type Point3,
  type Matrix4,
} from '../domain'
import { basisMatrix, dot3, type Basis3 } from './transform-gesture-math'

export type TransformOperationId = string

export type TransformOperation = {
  readonly id: TransformOperationId
  readonly transform: Transform
  /** Read-only pivot factors derived from the preceding operations in the stack. */
  readonly joint?: {
    readonly pivot: Point3
    readonly pivotEnabled?: boolean
    readonly before: readonly Transform[]
    /** The selected object axes; fixed for the entire gesture. */
    readonly basis?: Basis3
    readonly after: readonly Transform[]
  }
}

export type TransformStackState = {
  /** Visual top → bottom = matrix product left → right; points apply bottom → top. */
  readonly operations: readonly TransformOperation[]
}

export type StackEditFailure =
  'duplicate-operation-id' | 'operation-not-found' | 'index-out-of-range'

export type StackEditResult =
  | { readonly ok: true; readonly state: TransformStackState }
  | { readonly ok: false; readonly reason: StackEditFailure }

export const createOperationId = (state?: TransformStackState): string => {
  let max = 0
  if (state) {
    for (const op of state.operations) {
      const match = op.id.match(/^op-(\d+)$/)
      if (match) {
        max = Math.max(max, Number(match[1]))
      }
    }
  }
  return `op-${max + 1}`
}

export const createTransformStackState = (): TransformStackState => ({ operations: [] })

export const addTransformOperation = (
  state: TransformStackState,
  operation: TransformOperation,
): StackEditResult => {
  if (state.operations.some(({ id }) => id === operation.id)) {
    return { ok: false, reason: 'duplicate-operation-id' }
  }
  return {
    ok: true,
    state: resolveTransformStackState({ operations: [operation, ...state.operations] }),
  }
}

export const updateTransformOperation = (
  state: TransformStackState,
  id: TransformOperationId,
  transform: Transform,
): StackEditResult => {
  if (!state.operations.some((operation) => operation.id === id)) {
    return { ok: false, reason: 'operation-not-found' }
  }
  return {
    ok: true,
    state: resolveTransformStackState({
      operations: state.operations.map((operation) =>
        operation.id === id ? { ...operation, transform } : operation,
      ),
    }),
  }
}

export const removeTransformOperation = (
  state: TransformStackState,
  id: TransformOperationId,
): StackEditResult => {
  if (!state.operations.some((operation) => operation.id === id)) {
    return { ok: false, reason: 'operation-not-found' }
  }
  return {
    ok: true,
    state: resolveTransformStackState({
      operations: state.operations.filter((operation) => operation.id !== id),
    }),
  }
}

/** destinationIndex is the operation's final index after the move. */
export const moveTransformOperation = (
  state: TransformStackState,
  id: TransformOperationId,
  destinationIndex: number,
): StackEditResult => {
  const sourceIndex = state.operations.findIndex((operation) => operation.id === id)
  if (sourceIndex === -1) return { ok: false, reason: 'operation-not-found' }
  if (
    !Number.isInteger(destinationIndex) ||
    destinationIndex < 0 ||
    destinationIndex >= state.operations.length
  ) {
    return { ok: false, reason: 'index-out-of-range' }
  }
  const operations = [...state.operations]
  const [operation] = operations.splice(sourceIndex, 1)
  operations.splice(destinationIndex, 0, operation!)
  return { ok: true, state: resolveTransformStackState({ operations }) }
}

/** Own-center operations preserve the centre at their current application position. */
export const resolveTransformStackState = (state: TransformStackState): TransformStackState => {
  const operations = [...state.operations]
  let matrix = identity()
  let changed = false
  for (let index = operations.length - 1; index >= 0; index--) {
    let operation = operations[index]!
    if (operation.joint) {
      const pivot: Point3 = [matrix[3], matrix[7], matrix[11]]
      if (!operation.joint.pivot.every((n, i) => n === pivot[i])) {
        operation = {
          ...operation,
          joint: {
            ...operation.joint,
            pivot,
            before: [{ type: 'translation', x: -pivot[0], y: -pivot[1], z: -pivot[2] }],
            after: [{ type: 'translation', x: pivot[0], y: pivot[1], z: pivot[2] }],
          },
        }
        operations[index] = operation
        changed = true
      }
    }
    // Keep exactly the same factor order as the final composition, including its precision.
    for (const factor of getOperationTransforms(operation))
      matrix = multiply(factorMatrix(factor), matrix)
  }
  return changed ? { operations } : state
}

export const getTransformSequence = (state: TransformStackState): readonly TransformFactor[] =>
  [...resolveTransformStackState(state).operations].reverse().flatMap(getOperationTransforms)

export const getOperationTransforms = (
  operation: TransformOperation,
): readonly TransformFactor[] => {
  const joint = operation.joint
  if (!joint) return [operation.transform]
  return [
    ...(joint.pivotEnabled !== false ? joint.before : []),
    ...(joint.basis ? [basisMatrix(joint.basis, true)] : []),
    operation.transform,
    ...(joint.basis ? [basisMatrix(joint.basis)] : []),
    ...(joint.pivotEnabled !== false ? joint.after : []),
  ]
}

export const getOperationMatrix = (operation: TransformOperation): Matrix4 =>
  composeTransforms(getOperationTransforms(operation))

/** The editable matrix is expressed in its stated frame; its pivot column stays derived. */
export const getOperationLocalPivot = (operation: TransformOperation): Point3 => {
  const joint = operation.joint
  if (!joint) return [0, 0, 0]
  return joint.basis
    ? (joint.basis.map((axis) => dot3(axis, joint.pivot)) as unknown as Point3)
    : joint.pivot
}

export const getOperationDisplayMatrix = (operation: TransformOperation): Matrix4 => {
  if (!operation.joint?.basis) return getOperationMatrix(operation)
  const p = getOperationLocalPivot(operation)
  return composeTransforms(
    operation.joint.pivotEnabled !== false
      ? [
          { type: 'translation', x: -p[0], y: -p[1], z: -p[2] },
          operation.transform,
          { type: 'translation', x: p[0], y: p[1], z: p[2] },
        ]
      : [operation.transform],
  )
}

export const setOperationPivotEnabled = (
  state: TransformStackState,
  id: string,
  enabled: boolean,
): StackEditResult => {
  const operation = state.operations.find((op) => op.id === id)
  if (!operation?.joint) return { ok: false, reason: 'operation-not-found' }
  return {
    ok: true,
    state: resolveTransformStackState({
      operations: state.operations.map((op) =>
        op.id === id ? { ...op, joint: { ...operation.joint!, pivotEnabled: enabled } } : op,
      ),
    }),
  }
}

export const createPivotOperation = (
  id: string,
  transform: Transform,
  pivot: Point3,
  pivotEnabled = true,
  basis?: Basis3,
): TransformOperation => ({
  id,
  transform,
  joint: {
    pivot,
    pivotEnabled,
    ...(basis ? { basis } : {}),
    before: [{ type: 'translation', x: -pivot[0], y: -pivot[1], z: -pivot[2] }],
    after: [{ type: 'translation', x: pivot[0], y: pivot[1], z: pivot[2] }],
  },
})
