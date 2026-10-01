import type { Transform } from '../domain'

export type TransformOperationId = string

export type TransformOperation = {
  readonly id: TransformOperationId
  readonly transform: Transform
}

export type TransformStackState = {
  readonly operations: readonly TransformOperation[]
}

export type StackEditFailure =
  'duplicate-operation-id' | 'operation-not-found' | 'index-out-of-range'

export type StackEditResult =
  | { readonly ok: true; readonly state: TransformStackState }
  | { readonly ok: false; readonly reason: StackEditFailure }

export const createTransformStackState = (): TransformStackState => ({ operations: [] })

export const addTransformOperation = (
  state: TransformStackState,
  operation: TransformOperation,
): StackEditResult => {
  if (state.operations.some(({ id }) => id === operation.id)) {
    return { ok: false, reason: 'duplicate-operation-id' }
  }
  return { ok: true, state: { operations: [...state.operations, operation] } }
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
    state: {
      operations: state.operations.map((operation) =>
        operation.id === id ? { id, transform } : operation,
      ),
    },
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
    state: { operations: state.operations.filter((operation) => operation.id !== id) },
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
  return { ok: true, state: { operations } }
}

export const getTransformSequence = (state: TransformStackState): readonly Transform[] =>
  state.operations.map(({ transform }) => transform)
