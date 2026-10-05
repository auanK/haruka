import type { Frustum } from 'three'
import type { ActiveGridPlane } from './adaptive-grid'
import { chooseGridStep } from './grid-step'

export const MAX_LABEL_CANDIDATES_PER_AXIS = 16
export const DEFAULT_MIN_SPACING_DOWN = 54
export const DEFAULT_MIN_SPACING_UP = 70
export const COORDINATE_LABEL_OFFSET = 0.16
export type CoordinateAxis = 'x' | 'y' | 'z'

export type CoordinateAxisAnchor = {
  readonly fixedX: number
  readonly fixedY: number
  readonly fixedZ: number
}

export const deriveCoordinateAxisAnchor = (
  axis: CoordinateAxis,
  activePlane: ActiveGridPlane = 'xz',
  _focusOrOffset?: unknown,
  offset = COORDINATE_LABEL_OFFSET,
): CoordinateAxisAnchor => {
  const actualOffset = typeof _focusOrOffset === 'number' ? _focusOrOffset : offset
  if (activePlane === 'yz') {
    if (axis === 'y') return { fixedX: 0, fixedY: 0, fixedZ: actualOffset }
    if (axis === 'z') return { fixedX: 0, fixedY: actualOffset, fixedZ: 0 }
    return { fixedX: 0, fixedY: actualOffset, fixedZ: 0 }
  }
  if (activePlane === 'xy') {
    if (axis === 'x') return { fixedX: 0, fixedY: actualOffset, fixedZ: 0 }
    if (axis === 'y') return { fixedX: actualOffset, fixedY: 0, fixedZ: 0 }
    return { fixedX: 0, fixedY: actualOffset, fixedZ: 0 }
  }
  if (axis === 'x') return { fixedX: 0, fixedY: actualOffset, fixedZ: 0 }
  if (axis === 'z') return { fixedX: 0, fixedY: actualOffset, fixedZ: 0 }
  return { fixedX: actualOffset, fixedY: 0, fixedZ: 0 }
}

export const deriveCoordinateOriginAnchor = (
  activePlane: ActiveGridPlane = 'xz',
  _focusOrOffset?: unknown,
  offset = COORDINATE_LABEL_OFFSET,
): { readonly x: number; readonly y: number; readonly z: number } => {
  const actualOffset = typeof _focusOrOffset === 'number' ? _focusOrOffset : offset
  if (activePlane === 'yz') return { x: 0, y: actualOffset, z: -actualOffset }
  if (activePlane === 'xy') return { x: -actualOffset, y: actualOffset, z: 0 }
  return { x: -actualOffset, y: actualOffset, z: 0 }
}

export const next125Step = (step: number): number => {
  if (!Number.isFinite(step) || step < 1) return 1
  const base = 10 ** Math.floor(Math.log10(step))
  const ratio = step / base
  return Math.min(Number.MAX_VALUE, base * (ratio < 2 ? 2 : ratio < 5 ? 5 : 10))
}

const ceil125Step = (step: number): number => {
  if (step >= Number.MAX_VALUE) return Number.MAX_VALUE
  const rounded = Math.max(1, chooseGridStep(step))
  return rounded < step ? next125Step(rounded) : rounded
}

export type ChooseStrideOptions = {
  readonly pixelsPerUnit: number
  readonly currentStride?: number
  readonly minSpacingDown?: number
  readonly minSpacingUp?: number
}

export const chooseCoordinateLabelStride = ({
  pixelsPerUnit,
  currentStride,
  minSpacingDown = DEFAULT_MIN_SPACING_DOWN,
  minSpacingUp = DEFAULT_MIN_SPACING_UP,
}: ChooseStrideOptions): number => {
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) return Number.MAX_VALUE
  const needed = ceil125Step(minSpacingDown / pixelsPerUnit)
  if (currentStride === undefined || !Number.isFinite(currentStride) || currentStride < needed) {
    return needed
  }
  // Only reduce density after crossing the wider threshold on the way back in.
  return Math.min(currentStride, ceil125Step(minSpacingUp / pixelsPerUnit))
}

export const computeWorldAnchoredCandidates = (
  min: number,
  max: number,
  stride: number,
  out: number[] = [],
): number[] => {
  out.length = 0
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min > max ||
    !Number.isFinite(stride) ||
    stride <= 0
  )
    return out
  const step = ceil125Step(
    Math.max(
      stride,
      max / (MAX_LABEL_CANDIDATES_PER_AXIS - 1) - min / (MAX_LABEL_CANDIDATES_PER_AXIS - 1),
      Math.max(Math.abs(min), Math.abs(max)) * Number.EPSILON * 2,
    ),
  )
  const first = Math.ceil(min / step)
  const last = Math.floor(max / step)
  // Count slots, not world units; integer indexing avoids additive precision drift.
  for (let i = 0; i < MAX_LABEL_CANDIDATES_PER_AXIS && first + i <= last; i++) {
    const value = (first + i) * step
    if (Number.isFinite(value)) out.push(value === 0 ? 0 : value)
  }
  return out
}

export const deriveVisibleAxisInterval = (
  frustum: Frustum,
  axis: CoordinateAxis,
  min: number,
  max: number,
  anchor?: CoordinateAxisAnchor,
): { readonly min: number; readonly max: number } | null => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null
  const eff = anchor ?? deriveCoordinateAxisAnchor(axis, 'xz')
  const p0x = axis === 'x' ? 0 : eff.fixedX
  const p0y = axis === 'y' ? 0 : eff.fixedY
  const p0z = axis === 'z' ? 0 : eff.fixedZ
  for (const plane of frustum.planes) {
    const slope = plane.normal[axis]
    const constant =
      plane.constant + plane.normal.x * p0x + plane.normal.y * p0y + plane.normal.z * p0z
    if (slope > 0) min = Math.max(min, -constant / slope)
    else if (slope < 0) max = Math.min(max, -constant / slope)
    else if (constant < 0) return null
    if (min > max) return null
  }
  return { min, max }
}
