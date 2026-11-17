import { describe, expect, it } from 'vitest'
import { composeTransforms, multiply, toMatrix, transformPoint, type Transform } from '../../domain'
import { transformCubeVertices } from '../didactic-cube'
import {
  beginTransform,
  selectTarget,
  createDirectManipulationState,
  setGestureConstraint,
  setNumericInput,
  getDraftTransforms,
  derivePreviewMatrix,
  createDraftOperation,
} from '../direct-manipulation'
import {
  addTransformOperation,
  createPivotOperation,
  getTransformSequence,
  getOperationTransforms,
  getOperationDisplayMatrix,
  updateTransformOperation,
  moveTransformOperation,
  removeTransformOperation,
  getOperationMatrix,
  setOperationPivotEnabled,
} from '../transform-stack-state'
import { basisMatrix } from '../transform-gesture-math'

const original: readonly Transform[] = [
  { type: 'scale', x: 1.2345678912345, y: 0.789123456789, z: 2.345678912345 },
  { type: 'rotation', axis: 'z', angle: 0.3456789123456789 },
  { type: 'translation', x: 3.12345678912345, y: -2.2345678912345, z: 4.3456789123456 },
]
const matrix = composeTransforms(original)
const view = {
  pivot: [400, 300] as const,
  facing: [0.3, 0.4, Math.sqrt(0.75)] as const,
  right: [1, 0, 0] as const,
  up: [0, 1, 0] as const,
}
const draft = (kind: 'rotation' | 'scale', local = true) => {
  let state = beginTransform(
    selectTarget(createDirectManipulationState(), true),
    kind,
    transformCubeVertices(matrix),
    [500, 300],
    matrix,
    view,
    local ? 'local' : 'global',
  )
  state = setGestureConstraint(state, 'x')
  for (const key of kind === 'rotation' ? '37.123456789' : '1.234567891')
    state = setNumericInput(state, key)
  return state
}
describe('single-axis pivot operations', () => {
  it.each(['rotation', 'scale'] as const)(
    '%s from the table starts as a pure matrix and can enable the same pivot option',
    (type) => {
      const transform: Transform =
        type === 'rotation' ? { type, axis: 'x', angle: 0.7 } : { type, x: 2, y: 3, z: 4 }
      const operation = createPivotOperation('op-1', transform, [3, -2, 1], false)
      expect(getOperationMatrix(operation)).toEqual(toMatrix(transform))
      const enabled = setOperationPivotEnabled(
        {
          operations: [
            operation,
            { id: 'translation', transform: { type: 'translation', x: 3, y: -2, z: 1 } },
          ],
        },
        operation.id,
        true,
      )
      if (!enabled.ok) throw new Error(enabled.reason)
      const centered = getOperationMatrix(enabled.state.operations[0]!)
      transformPoint(centered, [3, -2, 1]).forEach((n, i) =>
        expect(n).toBeCloseTo([3, -2, 1][i]!, 13),
      )
      expect(centered).not.toEqual(toMatrix(transform))
    },
  )
  it.each([
    ['rotation', false],
    ['rotation', true],
    ['scale', false],
    ['scale', true],
  ] as const)('keeps exact preview factors for %s, local %s', (kind, local) => {
    const state = draft(kind, local),
      operation = createDraftOperation(state, 'op-4')!
    expect(operation.joint!.pivotEnabled).toBe(true)
    expect(getOperationTransforms(operation)).toEqual(getDraftTransforms(state))
    const before = {
      operations: [...original].reverse().map((transform, i) => ({ id: `op-${i + 1}`, transform })),
    }
    const added = addTransformOperation(before, operation)
    if (!added.ok) throw new Error(added.reason)
    expect(added.state.operations).toHaveLength(4)
    expect(composeTransforms(getTransformSequence(added.state))).toEqual(
      derivePreviewMatrix(matrix, state),
    )
    if (kind === 'rotation')
      expect(operation.transform).toMatchObject({ type: 'rotation', axis: 'x' })
  })
  it.each(['rotation', 'scale'] as const)(
    'shows the editable %s in its fixed local frame with the correct derived translation',
    (kind) => {
      const operation = createDraftOperation(draft(kind), 'op-1')!
      const frame = basisMatrix(operation.joint!.basis!),
        inverse = basisMatrix(operation.joint!.basis!, true)
      const displayed = getOperationDisplayMatrix(operation)
      const reconstructed = multiply(frame, multiply(displayed, inverse))
      const actual = getOperationMatrix(operation)
      reconstructed.forEach((n, i) => expect(n).toBeCloseTo(actual[i]!, 13))
      const linear = toMatrix(operation.transform)
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) expect(displayed[r * 4 + c]).toBe(linear[r * 4 + c])
    },
  )
  it('bypasses only the pivot and restores it exactly, preserving one editable angle and the saved frame', () => {
    const operation = createDraftOperation(draft('rotation'), 'op-4')!
    const disabled = setOperationPivotEnabled(
      {
        operations: [
          operation,
          ...[...original].reverse().map((transform, i) => ({ id: `op-${i + 1}`, transform })),
        ],
      },
      operation.id,
      false,
    )
    if (!disabled.ok) throw new Error(disabled.reason)
    const origin = getOperationMatrix(disabled.state.operations[0]!)
    for (const index of [3, 7, 11]) expect(origin[index]).toBe(0)
    const restored = setOperationPivotEnabled(disabled.state, operation.id, true)
    if (!restored.ok) throw new Error(restored.reason)
    expect(getOperationMatrix(restored.state.operations[0]!)).toEqual(getOperationMatrix(operation))
    const changed = updateTransformOperation(restored.state, operation.id, {
      type: 'rotation',
      axis: 'x',
      angle: Math.PI / 7,
    })
    if (!changed.ok) throw new Error(changed.reason)
    expect(changed.state.operations[0]!.joint!.basis).toBe(operation.joint!.basis)
    expect(changed.state.operations[0]!.joint!.before).toBe(operation.joint!.before)
    expect(changed.state.operations[0]!.joint!.after).toBe(operation.joint!.after)
  })
  it('moves and removes the entire operation, rebasing its pivot and preserving its frame', () => {
    const operation = createDraftOperation(draft('scale'), 'op-2')!,
      plain = { id: 'op-1', transform: { type: 'translation', x: 1, y: 0, z: 0 } as const }
    const moved = moveTransformOperation({ operations: [operation, plain] }, operation.id, 1)
    if (!moved.ok) throw new Error(moved.reason)
    expect(moved.state.operations.map(({ id }) => id)).toEqual([plain.id, operation.id])
    expect(moved.state.operations[1]!.joint!.pivot).toEqual([0, 0, 0])
    expect(moved.state.operations[1]!.joint!.basis).toBe(operation.joint!.basis)
    const removed = removeTransformOperation(moved.state, operation.id)
    if (!removed.ok) throw new Error(removed.reason)
    expect(removed.state.operations).toEqual([plain])
  })
})
