import { describe, expect, it, vi } from 'vitest'
import {
  composeTransforms,
  identity,
  multiply,
  toMatrix,
  transformPoint,
  type Point3,
} from '../../domain'
import { transformCubeVertices } from '../didactic-cube'
import {
  beginTranslation,
  cancelManipulation,
  commitManipulation,
  createDirectManipulationState,
  derivePreviewMatrix,
  isEffectiveTranslation,
  selectTarget,
  setAxisConstraint,
  setLockedAxis,
  updateTranslationDraft,
  type DirectManipulationState,
  type TranslationMeasureFn,
} from '../direct-manipulation'
import { addTransformOperation, getTransformSequence } from '../transform-stack-state'

const T1 = { type: 'translation', x: 2, y: 0, z: 0 } as const
const R = { type: 'rotation', axis: 'z', angle: Math.PI / 2 } as const
const committed = {
  operations: [
    { id: 'op-2', transform: R },
    { id: 'op-1', transform: T1 },
  ],
}
const committedMatrix = composeTransforms(getTransformSequence(committed))
const vertices = transformCubeVertices(committedMatrix)
const measure = (delta: Point3 | null) => vi.fn<TranslationMeasureFn>(() => delta)
const draft = (delta: Point3 = [3, 0, 0]) => {
  const selected = selectTarget(createDirectManipulationState(), true)
  const started = beginTranslation(selected, vertices)
  const moved = updateTranslationDraft(started, [10, 10], measure([0, 0, 0]))
  return updateTranslationDraft(moved, [50, 20], measure(delta))
}

describe('direct manipulation lifecycle', () => {
  it('selects, deselects and only starts a translation draft for a selected target', () => {
    const idle = createDirectManipulationState()
    expect(idle).toEqual({ phase: 'idle', selected: false, lockedAxis: null })
    expect(beginTranslation(idle, vertices)).toBe(idle)
    const selected = selectTarget(idle, true)
    expect(selected).toEqual({ phase: 'idle', selected: true, lockedAxis: null })
    expect(selectTarget(selected, false)).toEqual({
      phase: 'idle',
      selected: false,
      lockedAxis: null,
    })
    const started = beginTranslation(selected, vertices)
    expect(started).toMatchObject({
      phase: 'translation-draft',
      axis: 'free',
      lockedAxis: null,
      start: null,
      translation: { type: 'translation', x: 0, y: 0, z: 0 },
    })
    expect(beginTranslation(started, vertices)).toBe(started)
    expect(selectTarget(started, false)).toBe(started)
  })

  it('uses the centroid of the current vertices as the pivot', () => {
    const started = beginTranslation(selectTarget(createDirectManipulationState(), true), vertices)
    const pivot = (started as Extract<DirectManipulationState, { phase: 'translation-draft' }>)
      .pivot
    expect(pivot[0]).toBeCloseTo(0, 12)
    expect(pivot[1]).toBeCloseTo(2, 12)
    expect(pivot[2]).toBeCloseTo(0, 12)
  })

  it('anchors the first pointer as gesture start and measures every move from it', () => {
    const started = beginTranslation(selectTarget(createDirectManipulationState(), true), vertices)
    const first = measure([0, 0, 0])
    const moved = updateTranslationDraft(started, [10, 10], first)
    expect(first).toHaveBeenCalledWith([10, 10], [10, 10], expect.any(Array), 'free', null)
    const second = measure([2, 3, 4])
    const again = updateTranslationDraft(moved, [50, 20], second)
    expect(second).toHaveBeenCalledWith([10, 10], [50, 20], expect.any(Array), 'free', null)
    expect(again).toMatchObject({ translation: { x: 2, y: 3, z: 4 } })
    expect(updateTranslationDraft(again, [60, 20], measure(null))).toMatchObject({
      translation: { x: 2, y: 3, z: 4 },
    })
  })

  it('anchors immediately when start pointer is provided at gesture start (zero-jump initialization)', () => {
    const selected = selectTarget(createDirectManipulationState(), true)
    const started = beginTranslation(selected, vertices, [100, 200])
    expect(started).toMatchObject({
      phase: 'translation-draft',
      start: [100, 200],
      current: [100, 200],
      translation: { x: 0, y: 0, z: 0 },
    })
    const moveMeasure = measure([5, 0, 0])
    const moved = updateTranslationDraft(started, [120, 200], moveMeasure)
    expect(moveMeasure).toHaveBeenCalledWith(
      [100, 200],
      [120, 200],
      expect.any(Array),
      'free',
      null,
    )
    expect(moved).toMatchObject({ translation: { x: 5, y: 0, z: 0 } })
  })

  it('constrains to one axis and recomputes axis switches from the same origin', () => {
    const free = draft([2, 3, 4])
    const constrain = measure([2, 3, 4])
    const x = setAxisConstraint(free, 'x', constrain)
    const y = setAxisConstraint(x, 'y', constrain)
    const z = setAxisConstraint(y, 'z', constrain)
    expect(x).toMatchObject({ axis: 'x', translation: { x: 2, y: 0, z: 0 } })
    expect(y).toMatchObject({ axis: 'y', translation: { x: 0, y: 3, z: 0 } })
    expect(z).toMatchObject({ axis: 'z', translation: { x: 0, y: 0, z: 4 } })
    expect(free).toMatchObject({ axis: 'free', translation: { x: 2, y: 3, z: 4 } })
    for (const axis of ['x', 'y', 'z']) {
      expect(constrain).toHaveBeenCalledWith([10, 10], [50, 20], expect.any(Array), axis, null)
    }
  })

  it('cancels to the selected idle state and restores the committed matrix reference', () => {
    const moving = draft()
    expect(derivePreviewMatrix(committedMatrix, moving)).not.toEqual(committedMatrix)
    const canceled = cancelManipulation(moving)
    expect(canceled).toEqual({ phase: 'idle', selected: true, lockedAxis: null })
    expect(derivePreviewMatrix(committedMatrix, canceled)).toBe(committedMatrix)
  })
})

describe('direct manipulation preview and commit', () => {
  it('left-multiplies the draft: Mpreview = T2 · R · T1', () => {
    const preview = derivePreviewMatrix(committedMatrix, draft([3, 0, 0]))
    const T2 = toMatrix({ type: 'translation', x: 3, y: 0, z: 0 })
    expect(preview).toEqual(multiply(T2, multiply(toMatrix(R), toMatrix(T1))))
    const origin = transformPoint(preview, [0, 0, 0])
    expect(origin[0]).toBeCloseTo(3, 12)
    expect(origin[1]).toBeCloseTo(2, 12)
    expect(origin[2]).toBe(0)
  })

  it('commits one translation whose prepended stack matrix exactly equals the preview', () => {
    const moving = draft([3, 0, 0])
    const preview = derivePreviewMatrix(committedMatrix, moving)
    const { state, transform } = commitManipulation(moving)
    expect(state).toEqual({ phase: 'idle', selected: true, lockedAxis: null })
    expect(transform).toEqual({ type: 'translation', x: 3, y: 0, z: 0 })
    const result = addTransformOperation(committed, { id: 'op-3', transform: transform! })
    if (!result.ok) throw new Error(result.reason)
    expect(result.state.operations.map(({ id }) => id)).toEqual(['op-3', 'op-2', 'op-1'])
    expect(result.state.operations[1]).toBe(committed.operations[0])
    expect(composeTransforms(getTransformSequence(result.state))).toEqual(preview)
  })

  it.each([
    [0, 0, 0],
    [1e-12, -1e-12, 0],
  ] as const)('treats a %s, %s, %s move as a no-op commit', (x, y, z) => {
    const { state, transform } = commitManipulation(draft([x, y, z]))
    expect(state).toEqual({ phase: 'idle', selected: true, lockedAxis: null })
    expect(transform).toBeNull()
  })

  it('keeps commit and cancel inert outside a draft', () => {
    const idle = selectTarget(createDirectManipulationState(), true)
    expect(commitManipulation(idle)).toEqual({ state: idle, transform: null })
    expect(cancelManipulation(idle)).toBe(idle)
    expect(derivePreviewMatrix(identity(), idle)).toEqual(identity())
  })

  it('detects effective translations with a small tolerance, not display rounding', () => {
    expect(isEffectiveTranslation({ type: 'translation', x: 0, y: 0, z: 0 })).toBe(false)
    expect(isEffectiveTranslation({ type: 'translation', x: 0, y: 1e-12, z: 0 })).toBe(false)
    expect(isEffectiveTranslation({ type: 'translation', x: 0, y: 0, z: 0.00001 })).toBe(true)
  })
})

describe('axis lock 2D (plane lock)', () => {
  it('toggles lockedAxis and preserves it across idle and draft transitions', () => {
    const idle = selectTarget(createDirectManipulationState(), true)
    expect(idle.lockedAxis).toBeNull()
    const lockedZ = setLockedAxis(idle, 'z')
    expect(lockedZ.lockedAxis).toBe('z')
    const untoggled = setLockedAxis(lockedZ, 'z')
    expect(untoggled.lockedAxis).toBeNull()

    const withLock = setLockedAxis(idle, 'x')
    const started = beginTranslation(withLock, vertices)
    expect(started.lockedAxis).toBe('x')
    const canceled = cancelManipulation(started)
    expect(canceled.lockedAxis).toBe('x')
  })

  it('ignores contradictory axis shortcuts when a plane lock is active', () => {
    type DraftState = Extract<DirectManipulationState, { phase: 'translation-draft' }>
    const asDraft = (state: DirectManipulationState): DraftState => state as DraftState

    const idle = selectTarget(createDirectManipulationState(), true)
    const withLockZ = setLockedAxis(idle, 'z')
    const started = beginTranslation(withLockZ, vertices)
    expect(started.lockedAxis).toBe('z')
    expect(asDraft(started).axis).toBe('free')

    // Pressing Z when Z is locked is contradictory -> ignored
    const attemptedZ = setAxisConstraint(started, 'z')
    expect(attemptedZ).toBe(started)
    expect(asDraft(attemptedZ).axis).toBe('free')
    expect(attemptedZ.lockedAxis).toBe('z')

    // Pressing X or Y is permitted
    const measureX = measure([3, 0, 0])
    const constrainedX = setAxisConstraint(started, 'x', measureX)
    expect(asDraft(constrainedX).axis).toBe('x')
    expect(constrainedX.lockedAxis).toBe('z')
  })

  it('switches locks during draft and recalculates from original start without accumulation', () => {
    type DraftState = Extract<DirectManipulationState, { phase: 'translation-draft' }>
    const asDraft = (state: DirectManipulationState): DraftState => state as DraftState

    const selected = selectTarget(createDirectManipulationState(), true)
    const started = beginTranslation(selected, vertices, [10, 10])
    const measureFn = vi.fn<TranslationMeasureFn>((_s, _c, _p, _a, lock) => {
      if (lock === 'z') return [2, 3, 0]
      if (lock === 'x') return [0, 3, 4]
      return [2, 3, 4]
    })
    const moved = updateTranslationDraft(started, [50, 60], measureFn)
    expect(asDraft(moved).translation).toEqual({ type: 'translation', x: 2, y: 3, z: 4 })

    const lockedZ = setLockedAxis(moved, 'z', measureFn)
    expect(measureFn).toHaveBeenCalledWith([10, 10], [50, 60], expect.any(Array), 'free', 'z')
    expect(lockedZ.lockedAxis).toBe('z')
    expect(asDraft(lockedZ).translation).toEqual({ type: 'translation', x: 2, y: 3, z: 0 })

    const switchedToX = setLockedAxis(lockedZ, 'x', measureFn)
    expect(switchedToX.lockedAxis).toBe('x')
    expect(asDraft(switchedToX).translation).toEqual({ type: 'translation', x: 0, y: 3, z: 4 })
  })
})
