import { describe, it, expect } from 'vitest'
import {
  composeTransforms,
  computeTransformStages,
  identity,
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
const scale: Transform = Object.freeze({ type: 'scale', x: 2, y: 2, z: 2 })
const op1: TransformOperation = Object.freeze({ id: 'op-t', transform: translation })
const op2: TransformOperation = Object.freeze({ id: 'op-r', transform: rotation })
const op3: TransformOperation = Object.freeze({ id: 'op-s', transform: scale })
const state: TransformStackState = Object.freeze({ operations: Object.freeze([op1, op2, op3]) })

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

  it('appends an operation while preserving the existing order', () => {
    const original = Object.freeze({ operations: Object.freeze([op1]) })
    const next = editedState(addTransformOperation(original, op2))

    expect(next.operations).toEqual([op1, op2])
    expect(next).not.toBe(original)
    expect(original.operations).toEqual([op1])
    expect(op2).toEqual({ id: 'op-r', transform: rotation })
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
  it('replaces the transform while preserving ID, position and other operations', () => {
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
    'moves %s to final index %i, preserving IDs and transforms',
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

  it('preserves operation order and shares the original transforms', () => {
    const sequence = getTransformSequence(state)

    expect(sequence).toEqual([translation, rotation, scale])
    expect(sequence[0]).toBe(translation)
    expect(sequence[1]).toBe(rotation)
    expect(sequence[2]).toBe(scale)
    expect(state.operations).toEqual([op1, op2, op3])

    const moved = editedState(moveTransformOperation(state, op3.id, 0))
    expect(getTransformSequence(moved)).toEqual([scale, translation, rotation])
  })

  it('keeps adjacent translations separate through add, update, move and derivation', () => {
    const second: Transform = Object.freeze({ type: 'translation', x: 2, y: 0, z: 0 })
    const replacement: Transform = Object.freeze({ type: 'translation', x: 3, y: 0, z: 0 })
    const operation = Object.freeze({ id: 'op-t2', transform: second })
    const original = Object.freeze({ operations: Object.freeze([op1]) })
    const added = editedState(addTransformOperation(original, operation))
    expect(added.operations).toEqual([op1, operation])

    const updated = editedState(updateTransformOperation(added, operation.id, replacement))
    expect(updated.operations).toEqual([op1, { id: operation.id, transform: replacement }])

    const moved = editedState(moveTransformOperation(updated, operation.id, 0))
    expect(moved.operations).toEqual([{ id: operation.id, transform: replacement }, op1])
    const sequence = getTransformSequence(moved)
    expect(sequence).toEqual([replacement, translation])
    expect(sequence[0]).toBe(replacement)
    expect(sequence[1]).toBe(translation)
    expect(original.operations).toEqual([op1])
    expect(added.operations).toEqual([op1, operation])
    expect(updated.operations).toEqual([op1, { id: operation.id, transform: replacement }])
  })
})

describe('domain integration', () => {
  it('derives identity and only stage 0 from an empty application stack', () => {
    const sequence = getTransformSequence(createTransformStackState())

    expect(composeTransforms(sequence)).toEqual(identity())
    expect(computeTransformStages(sequence)).toEqual([identity()])
  })

  it('derives domain stages whose final matrix matches the composition', () => {
    const sequence = getTransformSequence(state)
    const stages = computeTransformStages(sequence)

    expect(stages).toHaveLength(4)
    expect(stages[0]).toEqual(identity())
    expect(stages[3]).toEqual(composeTransforms(sequence))
    const point = transformPoint(stages[3]!, [0, 0, 0])
    expect(point[0]).toBeCloseTo(0)
    expect(point[1]).toBeCloseTo(2)
    expect(point[2]).toBeCloseTo(0)
    expect(state.operations).toEqual([op1, op2, op3])
  })

  it('changes the composition and a known point when non-commuting operations are reordered', () => {
    const original = Object.freeze({ operations: Object.freeze([op1, op2]) })
    const before = composeTransforms(getTransformSequence(original))
    const moved = editedState(moveTransformOperation(original, op2.id, 0))
    const after = composeTransforms(getTransformSequence(moved))

    expect(before).not.toEqual(after)
    const beforePoint = transformPoint(before, [0, 0, 0])
    const afterPoint = transformPoint(after, [0, 0, 0])
    expect(beforePoint[0]).toBeCloseTo(0)
    expect(beforePoint[1]).toBeCloseTo(1)
    expect(beforePoint[2]).toBeCloseTo(0)
    expect(afterPoint[0]).toBeCloseTo(1)
    expect(afterPoint[1]).toBeCloseTo(0)
    expect(afterPoint[2]).toBeCloseTo(0)
    expect(original.operations).toEqual([op1, op2])
  })
})
