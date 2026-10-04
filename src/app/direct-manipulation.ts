import type { CubeVertex } from './didactic-cube'
import { multiply, toMatrix, type Matrix4, type Point3, type Translation } from '../domain'

export type AxisConstraint = 'free' | 'x' | 'y' | 'z'
export type LockedAxis = null | 'x' | 'y' | 'z'

export type DirectManipulationState =
  | {
      readonly phase: 'idle'
      readonly selected: boolean
      readonly lockedAxis: LockedAxis
    }
  | {
      readonly phase: 'translation-draft'
      readonly selected: true
      readonly axis: AxisConstraint
      readonly lockedAxis: LockedAxis
      readonly start: readonly [number, number] | null
      readonly current: readonly [number, number] | null
      readonly pivot: Point3
      readonly translation: Translation
    }

export type TranslationMeasureFn = (
  start: readonly [number, number],
  current: readonly [number, number],
  pivot: Point3,
  axis: AxisConstraint,
  lockedAxis: LockedAxis,
) => Point3 | null

export const isEditableKeyboardTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('input, select, textarea, [contenteditable], [data-no-drag]') !== null

const EPSILON = 1e-6

export const isEffectiveTranslation = (translation: Translation, epsilon = EPSILON): boolean =>
  Math.hypot(translation.x, translation.y, translation.z) > epsilon

export const createDirectManipulationState = (
  lockedAxis: LockedAxis = null,
): DirectManipulationState => ({
  phase: 'idle',
  selected: false,
  lockedAxis,
})

export const selectTarget = (
  state: DirectManipulationState,
  selected: boolean,
): DirectManipulationState => {
  if (state.phase !== 'idle') return state
  if (state.selected === selected) return state
  return { phase: 'idle', selected, lockedAxis: state.lockedAxis }
}

export const deriveCentroid = (vertices: readonly CubeVertex[]): Point3 => {
  if (vertices.length === 0) return [0, 0, 0]
  let x = 0
  let y = 0
  let z = 0
  for (const v of vertices) {
    x += v.point[0]
    y += v.point[1]
    z += v.point[2]
  }
  const count = vertices.length
  return [x / count, y / count, z / count]
}

export const beginTranslation = (
  state: DirectManipulationState,
  vertices: readonly CubeVertex[],
  startPointer?: readonly [number, number] | null,
): DirectManipulationState => {
  if (state.phase !== 'idle' || !state.selected) return state
  return {
    phase: 'translation-draft',
    selected: true,
    axis: 'free',
    lockedAxis: state.lockedAxis,
    start: startPointer ?? null,
    current: startPointer ?? null,
    pivot: deriveCentroid(vertices),
    translation: { type: 'translation', x: 0, y: 0, z: 0 },
  }
}

const applyAxisConstraint = (delta: Point3, axis: AxisConstraint): Point3 => {
  switch (axis) {
    case 'x':
      return [delta[0], 0, 0]
    case 'y':
      return [0, delta[1], 0]
    case 'z':
      return [0, 0, delta[2]]
    case 'free':
      return delta
  }
}

export const updateTranslationDraft = (
  state: DirectManipulationState,
  pointer: readonly [number, number],
  measure: TranslationMeasureFn,
): DirectManipulationState => {
  if (state.phase !== 'translation-draft') return state
  const start = state.start ?? pointer
  const delta = measure(start, pointer, state.pivot, state.axis, state.lockedAxis)
  if (!delta) {
    return { ...state, start, current: pointer }
  }
  const [x, y, z] = applyAxisConstraint(delta, state.axis)
  return {
    ...state,
    start,
    current: pointer,
    translation: { type: 'translation', x, y, z },
  }
}

export const setLockedAxis = (
  state: DirectManipulationState,
  axis: Exclude<LockedAxis, null>,
  measure?: TranslationMeasureFn,
): DirectManipulationState => {
  const nextLock: LockedAxis = state.lockedAxis === axis ? null : axis
  if (state.phase === 'idle') {
    return { ...state, lockedAxis: nextLock }
  }
  const nextAxis = state.axis === nextLock ? 'free' : state.axis
  if (measure && state.start && state.current) {
    const delta = measure(state.start, state.current, state.pivot, nextAxis, nextLock)
    if (delta) {
      const [x, y, z] = applyAxisConstraint(delta, nextAxis)
      return {
        ...state,
        axis: nextAxis,
        lockedAxis: nextLock,
        translation: { type: 'translation', x, y, z },
      }
    }
  }
  return {
    ...state,
    axis: nextAxis,
    lockedAxis: nextLock,
  }
}

export const setAxisConstraint = (
  state: DirectManipulationState,
  axis: AxisConstraint,
  measure?: TranslationMeasureFn,
): DirectManipulationState => {
  if (state.phase !== 'translation-draft') return state
  if (state.lockedAxis && axis === state.lockedAxis) {
    return state
  }
  if (measure && state.start && state.current) {
    const delta = measure(state.start, state.current, state.pivot, axis, state.lockedAxis)
    if (delta) {
      const [x, y, z] = applyAxisConstraint(delta, axis)
      return {
        ...state,
        axis,
        translation: { type: 'translation', x, y, z },
      }
    }
  }
  const [x, y, z] = applyAxisConstraint(
    [state.translation.x, state.translation.y, state.translation.z],
    axis,
  )
  return {
    ...state,
    axis,
    translation: { type: 'translation', x, y, z },
  }
}

export const cancelManipulation = (state: DirectManipulationState): DirectManipulationState => {
  if (state.phase !== 'translation-draft') return state
  return { phase: 'idle', selected: true, lockedAxis: state.lockedAxis }
}

export const commitManipulation = (
  state: DirectManipulationState,
): { readonly state: DirectManipulationState; readonly transform: Translation | null } => {
  if (state.phase !== 'translation-draft') {
    return { state, transform: null }
  }
  const nextState: DirectManipulationState = {
    phase: 'idle',
    selected: true,
    lockedAxis: state.lockedAxis,
  }
  if (!isEffectiveTranslation(state.translation)) {
    return { state: nextState, transform: null }
  }
  return { state: nextState, transform: state.translation }
}

export const derivePreviewMatrix = (
  committedMatrix: Matrix4,
  state: DirectManipulationState,
): Matrix4 => {
  if (state.phase !== 'translation-draft') return committedMatrix
  return multiply(toMatrix(state.translation), committedMatrix)
}
