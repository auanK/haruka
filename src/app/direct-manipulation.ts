import type { CubeVertex } from './didactic-cube'
import {
  createPivotOperation,
  getOperationTransforms,
  type TransformOperation,
} from './transform-stack-state'
import {
  multiply,
  factorMatrix,
  type TransformFactor,
  type Matrix4,
  type Point3,
  type Translation,
  type Rotation,
  type Scale,
  type Transform,
} from '../domain'
import { deriveLocalBasis, dot3, scale3, worldBasis, type Basis3 } from './transform-gesture-math'

export type AxisConstraint = 'free' | 'x' | 'y' | 'z'
export type LockedAxis = null | 'x' | 'y' | 'z'

export type TransformKind = 'translation' | 'rotation' | 'scale'
export type ScreenPoint = readonly [number, number]
export type GestureView = {
  readonly pivot: ScreenPoint
  readonly facing: Point3
  readonly right: Point3
  readonly up: Point3
}
export type GestureContext = {
  readonly space: 'global' | 'local'
  readonly defaultSpace?: 'global' | 'local'
  readonly plane: boolean
  readonly localBasis: Basis3
  readonly view: GestureView
  readonly numeric: string
  readonly component: number
  readonly components: readonly string[]
  readonly componentMode: boolean
  readonly reciprocal: boolean
  readonly raw: Point3
  readonly value: Point3
  readonly anchorRaw: Point3
  readonly anchorValue: Point3
  readonly precision: boolean
  readonly snap: boolean
  readonly lastAngle: number
}
type SpatialDraft = {
  readonly selected: true
  readonly axis: AxisConstraint
  readonly lockedAxis: LockedAxis
  readonly start: ScreenPoint | null
  readonly current: ScreenPoint | null
  readonly pivot: Point3
  readonly gesture: GestureContext
} & (
  | {
      readonly phase: 'rotation-draft'
      readonly rotation: Rotation
      readonly angle: number
    }
  | { readonly phase: 'scale-draft'; readonly scale: Scale; readonly factor: number }
)

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
      readonly gesture?: GestureContext
    }
  | SpatialDraft

export type ManipulationDraft = Exclude<DirectManipulationState, { phase: 'idle' }>
export type GestureMeasurement = {
  readonly translation?: Point3 | null
  readonly angle?: number | null
  readonly factor?: number | null
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
  if (state.phase !== 'translation-draft') return state
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
  if (state.phase === 'idle') return state
  return { phase: 'idle', selected: true, lockedAxis: state.lockedAxis }
}

export const commitManipulation = (
  state: DirectManipulationState,
): {
  readonly state: DirectManipulationState
  readonly transform: Transform | null
  readonly transforms?: readonly TransformFactor[]
} => {
  if (state.phase === 'idle') {
    return { state, transform: null }
  }
  const nextState: DirectManipulationState = {
    phase: 'idle',
    selected: true,
    lockedAxis: state.lockedAxis,
  }
  if (state.phase !== 'translation-draft') {
    const effective =
      state.phase === 'scale-draft'
        ? Math.max(
            Math.abs(state.scale.x - 1),
            Math.abs(state.scale.y - 1),
            Math.abs(state.scale.z - 1),
          ) > EPSILON
        : Math.abs(state.rotation.angle) > EPSILON
    return {
      state: nextState,
      transform: null,
      transforms: effective ? getDraftTransforms(state) : [],
    }
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
  if (state.phase === 'rotation-draft' && state.angle === 0) return committedMatrix
  if (
    state.phase === 'scale-draft' &&
    state.scale.x === 1 &&
    state.scale.y === 1 &&
    state.scale.z === 1
  )
    return committedMatrix
  return getDraftTransforms(state).reduce<Matrix4>(
    (matrix, transform) => multiply(factorMatrix(transform), matrix),
    committedMatrix,
  )
}

const axisIndex = (axis: Exclude<AxisConstraint, 'free'>) => ({ x: 0, y: 1, z: 2 })[axis]
export const getGestureBasis = (state: ManipulationDraft): Basis3 =>
  state.gesture?.space === 'local' ? state.gesture.localBasis : worldBasis

export const getGestureDirection = (state: ManipulationDraft): Point3 =>
  state.axis === 'free'
    ? (state.gesture?.view.facing ?? [0, 0, 1])
    : getGestureBasis(state)[axisIndex(state.axis)]!

export const beginTransform = (
  state: DirectManipulationState,
  kind: TransformKind,
  _vertices: readonly CubeVertex[],
  pointer: ScreenPoint | null,
  committedMatrix: Matrix4,
  view: GestureView,
  space: 'global' | 'local' = kind === 'scale' ? 'local' : 'global',
): DirectManipulationState => {
  if (state.phase !== 'idle' || !state.selected) return state
  const neutral: Point3 = kind === 'scale' ? [1, 1, 1] : [0, 0, 0]
  const gesture: GestureContext = {
    space,
    defaultSpace: space,
    plane: false,
    localBasis: deriveLocalBasis(committedMatrix),
    view,
    numeric: '',
    component: 0,
    components: [],
    componentMode: false,
    reciprocal: false,
    raw: neutral,
    value: neutral,
    anchorRaw: neutral,
    anchorValue: neutral,
    precision: false,
    snap: false,
    lastAngle: 0,
  }
  const common = {
    selected: true as const,
    axis: 'free' as const,
    lockedAxis: state.lockedAxis,
    start: pointer,
    current: pointer,
    pivot: [committedMatrix[3], committedMatrix[7], committedMatrix[11]] as Point3,
    gesture,
  }
  if (kind === 'translation')
    return {
      ...common,
      phase: 'translation-draft',
      translation: { type: 'translation', x: 0, y: 0, z: 0 },
    }
  if (kind === 'scale')
    return {
      ...common,
      phase: 'scale-draft',
      scale: { type: 'scale', x: 1, y: 1, z: 1 },
      factor: 1,
    }
  return {
    ...common,
    phase: 'rotation-draft',
    axis: 'z',
    rotation: { type: 'rotation', axis: 'z', angle: 0 },
    angle: 0,
  }
}

const applyGestureValue = (state: ManipulationDraft): DirectManipulationState => {
  const gesture = state.gesture
  if (!gesture) return state
  const parsedNumeric = gesture.numeric === '' ? undefined : Number(gesture.numeric)
  const numeric =
    parsedNumeric === undefined ? undefined : gesture.reciprocal ? 1 / parsedNumeric : parsedNumeric
  const validNumber =
    numeric !== undefined && Number.isFinite(numeric) && /\d/.test(gesture.numeric)
  let value = gesture.raw.map(
    (raw, i) =>
      gesture.anchorValue[i]! + (raw - gesture.anchorRaw[i]!) * (gesture.precision ? 0.1 : 1),
  ) as unknown as Point3
  if (validNumber)
    value =
      state.phase === 'translation-draft'
        ? state.axis === 'free'
          ? [numeric, 0, 0]
          : scale3(getGestureDirection(state), numeric)
        : state.phase === 'rotation-draft'
          ? [(numeric * Math.PI) / 180, 0, 0]
          : [numeric, numeric, numeric]
  if (gesture.componentMode) {
    const neutral = state.phase === 'scale-draft' ? 1 : 0
    const components = gesture.components.map((text, i) => {
      if (i === gesture.component) return validNumber ? numeric : neutral
      const number = Number(text)
      return text !== '' && Number.isFinite(number) ? number : neutral
    })
    while (components.length < 3) components.push(neutral)
    const activeAxes =
      state.axis === 'free'
        ? [0, 1, 2]
        : gesture.plane
          ? [0, 1, 2].filter((i) => i !== axisIndex(state.axis as 'x' | 'y' | 'z'))
          : [axisIndex(state.axis)]
    if (state.phase === 'translation-draft') {
      const basis = getGestureBasis(state)
      value = [0, 0, 0]
      activeAxes.forEach((index, i) => {
        const v = scale3(basis[index]!, components[i]!)
        value = [value[0] + v[0], value[1] + v[1], value[2] + v[2]]
      })
    } else if (state.phase === 'scale-draft') {
      const factors = [1, 1, 1]
      activeAxes.forEach((index, i) => {
        factors[index] = components[i]!
      })
      value = factors as unknown as Point3
    } else value = [(components[0]! * Math.PI) / 180, (components[1]! * Math.PI) / 180, 0]
  }
  if (gesture.snap && !validNumber) {
    const step =
      state.phase === 'rotation-draft'
        ? ((gesture.precision ? 1 : 5) * Math.PI) / 180
        : state.phase === 'scale-draft'
          ? gesture.precision
            ? 0.01
            : 0.1
          : gesture.precision
            ? 0.1
            : 1
    value = value.map((v) => Math.round(v / step) * step) as unknown as Point3
  }
  if (!value.every(Number.isFinite)) return state
  if (state.phase === 'translation-draft') {
    if (state.axis !== 'free') {
      const direction = getGestureDirection(state)
      const along = scale3(direction, dot3(value, direction))
      value = gesture.plane
        ? [value[0] - along[0], value[1] - along[1], value[2] - along[2]]
        : along
    }
    if (state.lockedAxis)
      value = value.map((v, i) => (i === axisIndex(state.lockedAxis!) ? 0 : v)) as unknown as Point3
  }
  const nextGesture = { ...gesture, value }
  if (state.phase === 'translation-draft') {
    let [x, y, z] = value
    if (validNumber && !gesture.componentMode && gesture.plane && state.axis !== 'free') {
      const basis = getGestureBasis(state)
      const values = basis.map((direction, i) =>
        i === axisIndex(state.axis as 'x' | 'y' | 'z') ? [0, 0, 0] : scale3(direction, numeric),
      ) as Point3[]
      x = values.reduce((sum, v) => sum + v[0], 0)
      y = values.reduce((sum, v) => sum + v[1], 0)
      z = values.reduce((sum, v) => sum + v[2], 0)
    }
    return { ...state, gesture: nextGesture, translation: { type: 'translation', x, y, z } }
  }
  if (state.phase === 'scale-draft') {
    const factor = value[0]
    const factors = gesture.componentMode
      ? [...value]
      : worldBasis.map((_v, i) =>
          state.axis === 'free' ||
          (gesture.plane ? i !== axisIndex(state.axis) : i === axisIndex(state.axis))
            ? factor
            : 1,
        )
    return {
      ...state,
      gesture: nextGesture,
      factor,
      scale: { type: 'scale', x: factors[0]!, y: factors[1]!, z: factors[2]! },
    }
  }
  const axis = state.axis === 'free' ? state.rotation.axis : state.axis
  return {
    ...state,
    gesture: nextGesture,
    angle: value[0],
    rotation: { type: 'rotation', axis, angle: value[0] },
  }
}

export const updateGestureDraft = (
  state: DirectManipulationState,
  pointer: ScreenPoint,
  measurement: GestureMeasurement,
): DirectManipulationState => {
  if (state.phase === 'idle' || !state.gesture) return state
  let raw = state.gesture.raw
  let lastAngle = state.gesture.lastAngle
  if (state.phase === 'translation-draft' && measurement.translation) raw = measurement.translation
  if (
    state.phase === 'scale-draft' &&
    measurement.factor !== null &&
    measurement.factor !== undefined
  )
    raw = [measurement.factor, measurement.factor, measurement.factor]
  if (state.phase === 'rotation-draft') {
    if (measurement.angle !== null && measurement.angle !== undefined) {
      const difference = Math.atan2(
        Math.sin(measurement.angle - lastAngle),
        Math.cos(measurement.angle - lastAngle),
      )
      raw = [raw[0] + difference, 0, 0]
      lastAngle = measurement.angle
    }
  }
  if (!raw.every(Number.isFinite) || !Number.isFinite(lastAngle)) return state
  return applyGestureValue({
    ...state,
    start: state.start ?? pointer,
    current: pointer,
    gesture: { ...state.gesture, raw, lastAngle },
  })
}

export const setGestureConstraint = (
  state: DirectManipulationState,
  axis: Exclude<AxisConstraint, 'free'>,
  plane = false,
): DirectManipulationState => {
  if (state.phase === 'idle' || !state.gesture) return state
  if (state.phase === 'rotation-draft' && state.axis === axis) return state
  if (state.phase === 'translation-draft' && state.lockedAxis === axis && !plane) return state
  const effectivePlane = state.phase !== 'rotation-draft' && plane
  const same =
    state.phase !== 'rotation-draft' &&
    state.axis === axis &&
    state.gesture.plane === effectivePlane
  const defaultSpace =
    state.gesture.defaultSpace ?? (state.phase === 'scale-draft' ? 'local' : 'global')
  const nextAxis = same && state.gesture.space !== defaultSpace ? 'free' : axis
  const space =
    same && state.gesture.space === defaultSpace
      ? defaultSpace === 'local'
        ? 'global'
        : 'local'
      : defaultSpace
  const gesture = {
    ...state.gesture,
    space: space as 'global' | 'local',
    plane: effectivePlane,
    lastAngle: 0,
    raw: state.gesture.raw,
  }
  return applyGestureValue({ ...state, axis: nextAxis, gesture })
}

export const setNumericInput = (
  state: DirectManipulationState,
  key: string,
): DirectManipulationState => {
  if (state.phase === 'idle' || !state.gesture) return state
  const gesture = state.gesture
  if (state.phase === 'rotation-draft' && (key === 'Tab' || key === 'PreviousComponent'))
    return state
  if (key === 'Tab' || key === 'PreviousComponent') {
    const count =
      state.phase === 'rotation-draft' ? 1 : state.axis === 'free' ? 3 : gesture.plane ? 2 : 1
    if (count === 1) return state
    const components = [...gesture.components]
    components[gesture.component] =
      gesture.reciprocal && gesture.numeric !== ''
        ? String(1 / Number(gesture.numeric))
        : gesture.numeric
    const component = (gesture.component + (key === 'Tab' ? 1 : count - 1)) % count
    return applyGestureValue({
      ...state,
      gesture: {
        ...gesture,
        component,
        components,
        numeric: components[component] ?? '',
        componentMode: true,
        reciprocal: false,
      },
    })
  }
  if (key === '/')
    return applyGestureValue({ ...state, gesture: { ...gesture, reciprocal: !gesture.reciprocal } })
  let numeric = state.gesture.numeric
  if (key === 'Backspace') numeric = numeric.slice(0, -1)
  else if (key === '-') numeric = numeric.startsWith('-') ? numeric.slice(1) : `-${numeric}`
  else if ((key === '.' || key === ',') && !numeric.includes('.')) numeric += '.'
  else if (/^\d$/.test(key) && numeric.length < 30) numeric += key
  else return state
  const components = [...gesture.components]
  components[gesture.component] = numeric
  return applyGestureValue({ ...state, gesture: { ...gesture, numeric, components } })
}

export const setGestureModifiers = (
  state: DirectManipulationState,
  precision: boolean,
  snap: boolean,
): DirectManipulationState => {
  if (state.phase === 'idle' || !state.gesture) return state
  const previous = state.gesture
  const anchor =
    precision !== previous.precision ? { anchorRaw: previous.raw, anchorValue: previous.value } : {}
  return applyGestureValue({ ...state, gesture: { ...previous, ...anchor, precision, snap } })
}

/** Only X/Y/Z rotations exist; local reference frames never become editable Euler angles. */
export const createDraftOperation = (
  state: DirectManipulationState,
  id: string,
): TransformOperation | null => {
  if (state.phase === 'idle') return null
  if (state.phase === 'translation-draft') return { id, transform: state.translation }
  return createPivotOperation(
    id,
    state.phase === 'rotation-draft' ? state.rotation : state.scale,
    state.pivot,
    true,
    state.gesture.space === 'local' ? state.gesture.localBasis : undefined,
  )
}

export const getDraftTransforms = (state: DirectManipulationState): readonly TransformFactor[] => {
  const operation = createDraftOperation(state, 'draft')
  return operation ? getOperationTransforms(operation) : []
}
