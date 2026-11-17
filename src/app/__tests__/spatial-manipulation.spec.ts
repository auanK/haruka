import { describe, expect, it } from 'vitest'
import { composeTransforms, identity, toMatrix, transformPoint, type Point3 } from '../../domain'
import { transformCubeVertices } from '../didactic-cube'
import {
  beginTransform,
  commitManipulation,
  createDirectManipulationState,
  derivePreviewMatrix,
  getDraftTransforms,
  selectTarget,
  setGestureConstraint,
  setNumericInput,
  updateGestureDraft,
  setGestureModifiers,
} from '../direct-manipulation'

const matrix = toMatrix({ type: 'translation', x: 3, y: 2, z: -1 })
const vertices = transformCubeVertices(matrix)
const view = {
  pivot: [400, 300] as const,
  facing: [0, 0, 1] as Point3,
  right: [1, 0, 0] as Point3,
  up: [0, 1, 0] as Point3,
}
const start = (kind: 'translation' | 'rotation' | 'scale', frame = view, original = matrix) =>
  beginTransform(
    selectTarget(createDirectManipulationState(), true),
    kind,
    transformCubeVertices(original),
    [500, 300],
    original,
    frame,
  )
const expectPoint = (actual: Point3, expected: Point3) =>
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 10))

describe('Blender modal rotation and scale', () => {
  it.each(['x', 'y', 'z'] as const)(
    'scales local %s after rotation without turning right angles into shear',
    (axis) => {
      const original = composeTransforms([
        { type: 'scale', x: 1.23456789, y: 2.34567891, z: 5 },
        { type: 'rotation', axis: 'x', angle: Math.PI / 4 },
        { type: 'rotation', axis: 'y', angle: 0.234567891 },
        { type: 'translation', x: 3.123456789, y: -2.34567891, z: 0.456789123 },
      ])
      const draft = setNumericInput(setGestureConstraint(start('scale', view, original), axis), '2')
      const result = derivePreviewMatrix(original, draft)
      expect(draft).toMatchObject({ gesture: { space: 'local' } })
      const columns = [0, 1, 2].map((c) => [result[c]!, result[4 + c]!, result[8 + c]!])
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) {
          const cosine =
            columns[i]!.reduce((sum, n, k) => sum + n * columns[j]![k]!, 0) /
            (Math.hypot(...columns[i]!) * Math.hypot(...columns[j]!))
          expect(cosine).toBeCloseTo(0, 14)
        }
      for (let c = 0; c < 3; c++) {
        const beforeLength = Math.hypot(original[c]!, original[4 + c]!, original[8 + c]!)
        expect(Math.hypot(...columns[c]!)).toBeCloseTo(
          beforeLength * (c === ['x', 'y', 'z'].indexOf(axis) ? 2 : 1),
          13,
        )
      }
      expectPoint(transformPoint(result, [0, 0, 0]), transformPoint(original, [0, 0, 0]))
    },
  )
  it('rotates about the current centroid and commits the exact preview factors', () => {
    let draft = setGestureConstraint(start('rotation'), 'z')
    draft = setNumericInput(draft, '9')
    draft = setNumericInput(draft, '0')
    const preview = derivePreviewMatrix(matrix, draft)
    expectPoint(transformPoint(preview, [0, 0, 0]), [3, 2, -1])
    expectPoint(transformPoint(preview, [1, 0, 0]), [3, 3, -1])
    expect(
      getDraftTransforms(draft).map((factor) => ('type' in factor ? factor.type : 'frame')),
    ).toEqual(['translation', 'rotation', 'translation'])
    const result = commitManipulation(draft)
    expect(result.state.phase).toBe('idle')
    expect(
      composeTransforms([{ type: 'translation', x: 3, y: 2, z: -1 }, ...result.transforms!]),
    ).toEqual(preview)
  })

  it('scales uniformly about a translated pivot and supports negative and zero factors', () => {
    const uniform = updateGestureDraft(start('scale'), [600, 300], { factor: 2 })
    expectPoint(transformPoint(derivePreviewMatrix(matrix, uniform), [1, 1, 1]), [5, 4, 1])
    expectPoint(transformPoint(derivePreviewMatrix(matrix, uniform), [0, 0, 0]), [3, 2, -1])
    let negative = setNumericInput(start('scale'), '-')
    negative = setNumericInput(negative, '2')
    expectPoint(transformPoint(derivePreviewMatrix(matrix, negative), [1, 0, 0]), [1, 2, -1])
    const zero = setNumericInput(start('scale'), '0')
    expect(commitManipulation(zero).transforms).toHaveLength(5)
    expectPoint(transformPoint(derivePreviewMatrix(matrix, zero), [1, 1, 1]), [3, 2, -1])
  })

  it('constrains scale to an axis or a plane', () => {
    const axis = setNumericInput(setGestureConstraint(start('scale'), 'x'), '2')
    expectPoint(transformPoint(derivePreviewMatrix(matrix, axis), [1, 1, 1]), [5, 3, 0])
    const plane = setNumericInput(setGestureConstraint(start('scale'), 'z', true), '2')
    expect(plane).toMatchObject({ scale: { z: 1 } })
    expectPoint(transformPoint(derivePreviewMatrix(matrix, plane), [1, 1, 1]), [5, 4, 0])
  })

  it('uses a single explicit X/Y/Z rotation regardless of view direction', () => {
    const d = 1 / Math.sqrt(3)
    let draft = setGestureConstraint(start('rotation', { ...view, facing: [d, d, d] }), 'z')
    for (const key of '90') draft = setNumericInput(draft, key)
    expect(draft).toMatchObject({ rotation: { type: 'rotation', axis: 'z', angle: Math.PI / 2 } })
    expect(
      getDraftTransforms(draft).filter((f) => 'type' in f && f.type === 'rotation'),
    ).toHaveLength(1)
    expectPoint(transformPoint(derivePreviewMatrix(matrix, draft), [1, 0, 0]), [3, 3, -1])
    expect(setGestureConstraint(draft, 'z')).toBe(draft)
  })

  it('cycles local, global and free scale constraints on repeated axis keys', () => {
    let draft = start('scale')
    draft = setGestureConstraint(draft, 'x')
    expect(draft).toMatchObject({ axis: 'x', gesture: { space: 'local' } })
    draft = setGestureConstraint(draft, 'x')
    expect(draft).toMatchObject({ axis: 'x', gesture: { space: 'global' } })
    draft = setGestureConstraint(draft, 'x')
    expect(draft).toMatchObject({ axis: 'free' })
  })

  it('uses local axes of an already rotated object', () => {
    const original = composeTransforms([
      { type: 'rotation', axis: 'z', angle: Math.PI / 2 },
      { type: 'translation', x: 3, y: 2, z: -1 },
    ])
    let draft = start('scale', view, original)
    draft = setGestureConstraint(draft, 'x')
    draft = setNumericInput(draft, '2')
    expect(draft).toMatchObject({ gesture: { space: 'local' } })
    expectPoint(transformPoint(derivePreviewMatrix(original, draft), [1, 0, 0]), [3, 4, -1])
  })

  it('does not commit neutral drafts or corrupt previews with incomplete numeric input', () => {
    for (const kind of ['rotation', 'scale'] as const) {
      expect(commitManipulation(start(kind)).transforms).toEqual([])
      const incomplete = setNumericInput(start(kind), '-')
      expect(derivePreviewMatrix(matrix, incomplete).every(Number.isFinite)).toBe(true)
      expect(getDraftTransforms(incomplete).length).toBeGreaterThan(0)
    }
    expect(
      beginTransform(createDirectManipulationState(), 'scale', vertices, null, identity(), view)
        .phase,
    ).toBe('idle')
  })

  it('supports Blender simple numeric components, reciprocal, decimals and sign', () => {
    let translation = start('translation')
    for (const key of ['1', 'Tab', '2', 'Tab', '-', '3', '.', '5'])
      translation = setNumericInput(translation, key)
    expect(translation).toMatchObject({ translation: { x: 1, y: 2, z: -3.5 } })
    const half = setNumericInput(setNumericInput(start('scale'), '2'), '/')
    expect(half).toMatchObject({ scale: { x: 0.5, y: 0.5, z: 0.5 } })
    let plane = setGestureConstraint(start('scale'), 'z', true)
    for (const key of ['2', 'Tab', '3']) plane = setNumericInput(plane, key)
    expect(plane).toMatchObject({ scale: { x: 2, y: 3, z: 1 } })
  })

  it('applies precision without jumping, and snaps rotation and scale increments', () => {
    let scale = updateGestureDraft(start('scale'), [600, 300], { factor: 2 })
    scale = setGestureModifiers(scale, true, false)
    expect(scale).toMatchObject({ factor: 2 })
    scale = updateGestureDraft(scale, [700, 300], { factor: 3 })
    expect(scale).toMatchObject({ factor: 2.1 })
    scale = setGestureModifiers(scale, false, false)
    expect(scale).toMatchObject({ factor: 2.1 })
    const snapped = setGestureModifiers(
      updateGestureDraft(start('rotation'), [600, 300], { angle: (7 * Math.PI) / 180 }),
      false,
      true,
    )
    if (snapped.phase !== 'rotation-draft') throw new Error('Expected rotation')
    expect((snapped.angle * 180) / Math.PI).toBeCloseTo(5)
    expect(
      setGestureModifiers(
        updateGestureDraft(start('scale'), [600, 300], { factor: 1.26 }),
        false,
        true,
      ),
    ).toMatchObject({ factor: 1.3 })
  })

  it('supports continuous turns around one axis and invalid-measure recovery', () => {
    let turn = start('rotation')
    for (const angle of [1, 2, 3, -2, -1, 0, 1])
      turn = updateGestureDraft(turn, [600, 300], { angle })
    if (turn.phase !== 'rotation-draft') throw new Error('Expected rotation')
    expect(turn.angle).toBeCloseTo(2 * Math.PI + 1)
    const invalid = updateGestureDraft(turn, [700, 300], { angle: Number.NaN })
    expect(invalid).toBe(turn)
    expect(
      derivePreviewMatrix(matrix, updateGestureDraft(invalid, [701, 300], { angle: 2 })).every(
        Number.isFinite,
      ),
    ).toBe(true)
  })
})
