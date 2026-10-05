import type { ViewAxisLock } from './viewport'

export type ReferencePlane = 'xz' | 'yz' | 'xy'

export type ReferenceFrameInput = ViewAxisLock | { readonly lock: ViewAxisLock }

export type ReferenceFrame = {
  readonly plane: ReferencePlane
  readonly normalAxis: 'x' | 'y' | 'z'
  readonly normalValue: number
  readonly origin: readonly [number, number, number]
  readonly sliceLabel: string
}

export const formatSliceIndicator = (frame: ReferenceFrame, precision = 4): string => {
  const planeStr = frame.plane.toUpperCase()
  const axisStr = frame.normalAxis.toUpperCase()
  const val = frame.normalValue
  const formattedVal = Number.isInteger(val)
    ? String(val)
    : parseFloat(val.toFixed(precision)).toString()
  return `${planeStr} · ${axisStr} = ${formattedVal}`
}

export const deriveReferenceFrame = (input: ReferenceFrameInput = null): ReferenceFrame => {
  const lock = typeof input === 'object' && input !== null ? input.lock : input

  let plane: ReferencePlane
  let normalAxis: 'x' | 'y' | 'z'

  if (lock === 'x') {
    plane = 'yz'
    normalAxis = 'x'
  } else if (lock === 'z') {
    plane = 'xy'
    normalAxis = 'z'
  } else {
    // Free view (null) or Lock Y: floor slice XZ, normal Y
    plane = 'xz'
    normalAxis = 'y'
  }

  const normalValue = 0
  const origin: readonly [number, number, number] = [0, 0, 0]
  const sliceLabel = formatSliceIndicator({
    plane,
    normalAxis,
    normalValue,
    origin,
    sliceLabel: '',
  })

  return {
    plane,
    normalAxis,
    normalValue,
    origin,
    sliceLabel,
  }
}
