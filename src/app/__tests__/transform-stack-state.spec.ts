import { describe, it, expect } from 'vitest'
import {
  composeTransforms,
  computeTransformStages,
  identity,
  multiply,
  toMatrix,
  transformPoint,
  type Transform,
} from '../../domain'
import {
  createTransformStackState,
  addTransformOperation,
  updateTransformOperation,
  removeTransformOperation,
  moveTransformOperation,
  getTransformSequence,
  type StackEditResult,
  type TransformOperation,
  type TransformStackState,
} from '../transform-stack-state'

const translation: Transform = Object.freeze({ type: 'translation', x: 1, y: 0, z: 0 })
const rotation: Transform = Object.freeze({ type: 'rotation', axis: 'z', angle: Math.PI / 2 })
const scale: Transform = Object.freeze({ type: 'scale', x: 2, y: 3, z: 4 })
const op1: TransformOperation = Object.freeze({ id: 'op-t', transform: translation })
const op2: TransformOperation = Object.freeze({ id: 'op-r', transform: rotation })
const op3: TransformOperation = Object.freeze({ id: 'op-s', transform: scale })
const state: TransformStackState = Object.freeze({ operations: Object.freeze([op1, op2, op3]) })
const productState: TransformStackState = Object.freeze({
  operations: Object.freeze([op3, op2, op1]),
})

const editedState = (result: StackEditResult): TransformStackState => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  return result.state
}

describe('createTransformStackState', () => {
  it('creates an empty stack without a default operation', () => {
    expect(createTransformStackState()).toEqual({ operations: [] })
  })
})

describe('addTransformOperation', () => {
  it('adds an operation to an empty stack without mutating the inputs', () => {
    const empty = Object.freeze({ operations: Object.freeze([]) })
    const next = editedState(addTransformOperation(empty, op1))

    expect(next.operations).toEqual([op1])
    expect(next).not.toBe(empty)
    expect(empty.operations).toEqual([])
    expect(op1).toEqual({ id: 'op-t', transform: translation })
  })

  it('prepends R above T in visual/product order without mutating or copying operations', () => {
    const original = Object.freeze({ operations: Object.freeze([op1]) })
    const next = editedState(addTransformOperation(original, op2))

    expect(next.operations).toEqual([op2, op1])
    expect(next.operations[0]).toBe(op2)
    expect(next.operations[1]).toBe(op1)
    expect(next.operations).not.toBe(original.operations)
    expect(next).not.toBe(original)
    expect(original.operations).toEqual([op1])
    expect(op2).toEqual({ id: 'op-r', transform: rotation })
  })

  it('prepends S to visual [R, T] because a new operation left-multiplies the existing product', () => {
    const original = Object.freeze({ operations: Object.freeze([op2, op1]) })
    const previousMatrix = composeTransforms(getTransformSequence(original))
    const next = editedState(addTransformOperation(original, op3))

    expect(next.operations).toEqual([op3, op2, op1])
    expect(next.operations[0]).toBe(op3)
    expect(next.operations[1]).toBe(op2)
    expect(next.operations[2]).toBe(op1)
    expect(composeTransforms(getTransformSequence(next))).toEqual(
      multiply(toMatrix(scale), previousMatrix),
    )
    expect(original.operations).toEqual([op2, op1])
  })

  it('rejects a duplicate ID without replacing the existing operation', () => {
    const duplicate = Object.freeze({ id: op2.id, transform: scale })

    expect(addTransformOperation(state, duplicate)).toEqual({
      ok: false,
      reason: 'duplicate-operation-id',
    })
    expect(state.operations).toEqual([op1, op2, op3])
    expect(duplicate).toEqual({ id: 'op-r', transform: scale })
  })
})

describe('updateTransformOperation', () => {
  it('replaces the transform while preserving ID, visual position and other operations', () => {
    const replacement: Transform = Object.freeze({ type: 'rotation', axis: 'x', angle: -Math.PI })
    const next = editedState(updateTransformOperation(state, op2.id, replacement))

    expect(next.operations).toEqual([op1, { id: op2.id, transform: replacement }, op3])
    expect(next.operations[1]?.transform).toBe(replacement)
    expect(next.operations[0]).toBe(op1)
    expect(next.operations[2]).toBe(op3)
    expect(next).not.toBe(state)
    expect(state.operations).toEqual([op1, op2, op3])
    expect(op2.transform).toBe(rotation)
    expect(replacement).toEqual({ type: 'rotation', axis: 'x', angle: -Math.PI })
  })

  it.each([state, createTransformStackState()])('rejects a missing ID in stack %#', (original) => {
    const snapshot = [...original.operations]

    expect(updateTransformOperation(original, 'missing', translation)).toEqual({
      ok: false,
      reason: 'operation-not-found',
    })
    expect(original.operations).toEqual(snapshot)
  })
})

describe('removeTransformOperation', () => {
  it.each([
    [op1.id, [op2, op3]],
    [op2.id, [op1, op3]],
    [op3.id, [op1, op2]],
  ] as const)('removes %s while preserving the remaining operations', (id, expected) => {
    const next = editedState(removeTransformOperation(state, id))

    expect(next.operations).toEqual(expected)
    expect(next.operations[0]).toBe(expected[0])
    expect(next.operations[1]).toBe(expected[1])
    expect(next).not.toBe(state)
    expect(state.operations).toEqual([op1, op2, op3])
  })

  it('removes the only operation and leaves an empty stack', () => {
    const original = Object.freeze({ operations: Object.freeze([op1]) })
    const next = editedState(removeTransformOperation(original, op1.id))

    expect(next.operations).toEqual([])
    expect(next).not.toBe(original)
    expect(original.operations).toEqual([op1])
  })

  it.each([state, createTransformStackState()])(
    'rejects removal of a missing ID in stack %#',
    (original) => {
      const snapshot = [...original.operations]

      expect(removeTransformOperation(original, 'missing')).toEqual({
        ok: false,
        reason: 'operation-not-found',
      })
      expect(original.operations).toEqual(snapshot)
    },
  )
})

describe('moveTransformOperation', () => {
  it.each([
    [op1.id, 2, [op2, op3, op1]],
    [op3.id, 0, [op3, op1, op2]],
    [op2.id, 0, [op2, op1, op3]],
    [op2.id, 2, [op1, op3, op2]],
    [op2.id, 1, [op1, op2, op3]],
  ] as const)(
    'moves %s to final visual index %i, preserving IDs and transforms',
    (id, index, expected) => {
      const next = editedState(moveTransformOperation(state, id, index))

      expect(next.operations).toEqual(expected)
      for (const [position, operation] of expected.entries()) {
        expect(next.operations[position]).toBe(operation)
      }
      expect(next).not.toBe(state)
      expect(state.operations).toEqual([op1, op2, op3])
    },
  )

  it.each([state, createTransformStackState()])(
    'rejects moving a missing ID in stack %#',
    (original) => {
      const snapshot = [...original.operations]

      expect(moveTransformOperation(original, 'missing', 0)).toEqual({
        ok: false,
        reason: 'operation-not-found',
      })
      expect(original.operations).toEqual(snapshot)
    },
  )

  it.each([-1, state.operations.length, 99, 0.5, NaN, Infinity, -Infinity])(
    'rejects invalid destination %s without clamping or mutating the state',
    (index) => {
      expect(moveTransformOperation(state, op2.id, index)).toEqual({
        ok: false,
        reason: 'index-out-of-range',
      })
      expect(state.operations).toEqual([op1, op2, op3])
    },
  )
})

describe('getTransformSequence', () => {
  it('derives an empty sequence from an empty stack', () => {
    expect(getTransformSequence(createTransformStackState())).toEqual([])
  })

  it('derives application order [T, R, S] from visual/product [S, R, T] and shares transforms without mutation', () => {
    const operations = productState.operations
    const sequence = getTransformSequence(productState)

    expect(sequence).toEqual([translation, rotation, scale])
    expect(sequence[0]).toBe(translation)
    expect(sequence[1]).toBe(rotation)
    expect(sequence[2]).toBe(scale)
    expect(productState.operations).toBe(operations)
    expect(productState.operations).toEqual([op3, op2, op1])

    const moved = editedState(moveTransformOperation(productState, op1.id, 1))
    expect(moved.operations).toEqual([op3, op1, op2])
    expect(getTransformSequence(moved)).toEqual([rotation, translation, scale])
  })

  it('keeps adjacent translations separate through add, update, move and derivation', () => {
    const second: Transform = Object.freeze({ type: 'translation', x: 2, y: 0, z: 0 })
    const replacement: Transform = Object.freeze({ type: 'translation', x: 3, y: 0, z: 0 })
    const operation = Object.freeze({ id: 'op-t2', transform: second })
    const original = Object.freeze({ operations: Object.freeze([op1]) })
    const added = editedState(addTransformOperation(original, operation))
    expect(added.operations).toEqual([operation, op1])

    const updated = editedState(updateTransformOperation(added, operation.id, replacement))
    expect(updated.operations).toEqual([{ id: operation.id, transform: replacement }, op1])

    const moved = editedState(moveTransformOperation(updated, op1.id, 0))
    expect(moved.operations).toEqual([op1, { id: operation.id, transform: replacement }])
    const sequence = getTransformSequence(moved)
    expect(sequence).toEqual([replacement, translation])
    expect(sequence[0]).toBe(replacement)
    expect(sequence[1]).toBe(translation)
    expect(original.operations).toEqual([op1])
    expect(added.operations).toEqual([operation, op1])
    expect(updated.operations).toEqual([{ id: operation.id, transform: replacement }, op1])
  })
})

describe('domain integration', () => {
  it('derives identity and only stage 0 from an empty application stack', () => {
    const sequence = getTransformSequence(createTransformStackState())

    expect(composeTransforms(sequence)).toEqual(identity())
    expect(computeTransformStages(sequence)).toEqual([identity()])
  })

  it('composes visual/product [S, R, T] as S · R · T for a non-commuting point', () => {
    const matrix = composeTransforms(getTransformSequence(productState))
    const expected = multiply(toMatrix(scale), multiply(toMatrix(rotation), toMatrix(translation)))

    expect(matrix).toEqual(expected)
    const point = transformPoint(matrix, [2, 3, 4])
    expect(point[0]).toBeCloseTo(-6)
    expect(point[1]).toBeCloseTo(9)
    expect(point[2]).toBeCloseTo(16)
    expect(productState.operations).toEqual([op3, op2, op1])
  })

  it('derives application stages I → T → R · T → S · R · T from visual/product [S, R, T]', () => {
    const sequence = getTransformSequence(productState)
    const stages = computeTransformStages(sequence)
    const translated = toMatrix(translation)
    const rotated = multiply(toMatrix(rotation), translated)
    const scaled = multiply(toMatrix(scale), rotated)

    expect(stages).toEqual([identity(), translated, rotated, scaled])
    expect(stages[3]).toEqual(composeTransforms(sequence))
    const point = transformPoint(stages[3]!, [0, 0, 0])
    expect(point[0]).toBeCloseTo(0)
    expect(point[1]).toBeCloseTo(3)
    expect(point[2]).toBeCloseTo(0)
    expect(productState.operations).toEqual([op3, op2, op1])
  })

  it('moves T up in visual/product [R, T] to [T, R], changing R · T to T · R', () => {
    const original = Object.freeze({ operations: Object.freeze([op2, op1]) })
    const before = composeTransforms(getTransformSequence(original))
    const moved = editedState(moveTransformOperation(original, op1.id, 0))
    const after = composeTransforms(getTransformSequence(moved))

    expect(moved.operations).toEqual([op1, op2])
    expect(before).toEqual(multiply(toMatrix(rotation), toMatrix(translation)))
    expect(after).toEqual(multiply(toMatrix(translation), toMatrix(rotation)))
    expect(before).not.toEqual(after)
    const beforePoint = transformPoint(before, [0, 0, 0])
    const afterPoint = transformPoint(after, [0, 0, 0])
    expect(beforePoint[0]).toBeCloseTo(0)
    expect(beforePoint[1]).toBeCloseTo(1)
    expect(beforePoint[2]).toBeCloseTo(0)
    expect(afterPoint[0]).toBeCloseTo(1)
    expect(afterPoint[1]).toBeCloseTo(0)
    expect(afterPoint[2]).toBeCloseTo(0)
    expect(original.operations).toEqual([op2, op1])
  })
})
