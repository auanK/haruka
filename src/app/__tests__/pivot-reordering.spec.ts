import { describe, expect, it } from 'vitest'
import { composeTransforms, transformPoint, type Transform } from '../../domain'
import {
  addTransformOperation,
  createPivotOperation,
  getOperationDisplayMatrix,
  getTransformSequence,
  moveTransformOperation,
  removeTransformOperation,
  resolveTransformStackState,
  setOperationPivotEnabled,
  updateTransformOperation,
  type StackEditResult,
  type TransformStackState,
} from '../transform-stack-state'

const edited = (result: StackEditResult): TransformStackState => {
  if (!result.ok) throw new Error(result.reason)
  return result.state
}
const centre = (state: TransformStackState) =>
  transformPoint(composeTransforms(getTransformSequence(state)), [0, 0, 0])
const expectCentre = (state: TransformStackState, expected: readonly number[]) =>
  centre(state).forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 12))
const transforms: readonly Transform[] = [
  { type: 'rotation', axis: 'z', angle: Math.PI / 3 },
  { type: 'scale', x: 2, y: 3, z: 4 },
]

describe('own centre follows the current application order', () => {
  it.each(transforms)(
    'rebases a $type created at the origin after reorder, edit and removal',
    (transform) => {
      let state: TransformStackState = {
        operations: [createPivotOperation('local', transform, [0, 0, 0])],
      }
      state = edited(
        addTransformOperation(state, {
          id: 'move',
          transform: { type: 'translation', x: 3, y: -2, z: 5 },
        }),
      )
      expectCentre(state, [3, -2, 5])
      state = edited(moveTransformOperation(state, 'local', 0))
      expect(state.operations[0]!.joint!.pivot).toEqual([3, -2, 5])
      expectCentre(state, [3, -2, 5])

      state = edited(
        updateTransformOperation(state, 'move', {
          type: 'translation',
          x: -7.12345678912345,
          y: 4.2345678912345,
          z: 2,
        }),
      )
      expect(state.operations[0]!.joint!.pivot).toEqual([-7.12345678912345, 4.2345678912345, 2])
      expectCentre(state, [-7.12345678912345, 4.2345678912345, 2])

      const ownCentre = state
      state = edited(setOperationPivotEnabled(state, 'local', false))
      expect(centre(state)).not.toEqual(centre(ownCentre))
      state = edited(setOperationPivotEnabled(state, 'local', true))
      expectCentre(state, centre(ownCentre))
      state = edited(removeTransformOperation(state, 'move'))
      expect(state.operations[0]!.joint!.pivot).toEqual([0, 0, 0])
      expectCentre(state, [0, 0, 0])
    },
  )

  it.each(transforms)(
    'derives a framed $type from preceding operations without changing its linear cells',
    (transform) => {
      const basis = [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, 1],
      ] as const
      const operation = createPivotOperation('local', transform, [0, 0, 0], true, basis)
      const state = resolveTransformStackState({
        operations: [
          operation,
          { id: 'origin-rotation', transform: { type: 'rotation', axis: 'z', angle: Math.PI / 2 } },
          { id: 'move', transform: { type: 'translation', x: 2, y: 3, z: 4 } },
        ],
      })
      expectCentre(state, [-3, 2, 4])
      expect(state.operations[0]!.joint!.basis).toBe(basis)
      const actual = getOperationDisplayMatrix(state.operations[0]!)
      const central = getOperationDisplayMatrix(operation)
      for (const index of [0, 1, 2, 4, 5, 6, 8, 9, 10]) expect(actual[index]).toBe(central[index])
      expect(actual[3]).not.toBe(central[3])
      expect(resolveTransformStackState(state)).toBe(state)
      expect(operation.joint!.pivot).toEqual([0, 0, 0])
    },
  )
})
