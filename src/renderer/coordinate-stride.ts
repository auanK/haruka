import type { Frustum } from 'three'
import { chooseGridStep } from './grid-step'

export const MAX_LABEL_CANDIDATES_PER_AXIS = 16
export const DEFAULT_MIN_SPACING_DOWN = 32
export const DEFAULT_MIN_SPACING_UP = 48
export const COORDINATE_LABEL_OFFSET = 0.16
export type CoordinateAxis = 'x' | 'y' | 'z'

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
): { readonly min: number; readonly max: number } | null => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null
  for (const plane of frustum.planes) {
    const slope = plane.normal[axis]
    const constant =
      plane.constant + COORDINATE_LABEL_OFFSET * (axis === 'y' ? plane.normal.x : plane.normal.y)
    if (slope > 0) min = Math.max(min, -constant / slope)
    else if (slope < 0) max = Math.min(max, -constant / slope)
    else if (constant < 0) return null
    if (min > max) return null
  }
  return { min, max }
}
