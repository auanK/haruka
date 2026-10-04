import type { ViewAxisLock } from './viewport'

export type ReferencePlane = 'xz' | 'yz' | 'xy'

export type ReferenceFrameInput = {
  readonly lock: ViewAxisLock
  readonly focus:
    | { readonly x: number; readonly y: number; readonly z: number }
    | readonly [number, number, number]
}

export type ReferenceFrame = {
  readonly plane: ReferencePlane
  readonly normalAxis: 'x' | 'y' | 'z'
  readonly normalValue: number
  readonly origin: readonly [number, number, number]
  readonly sliceLabel: string
}

const getCoord = (
  focus:
    | { readonly x: number; readonly y: number; readonly z: number }
    | readonly [number, number, number],
  axis: 'x' | 'y' | 'z',
): number => {
  if (Array.isArray(focus)) {
    return axis === 'x' ? focus[0]! : axis === 'y' ? focus[1]! : focus[2]!
  }
  const obj = focus as { readonly x: number; readonly y: number; readonly z: number }
  return obj[axis]
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

export const deriveReferenceFrame = (input: ReferenceFrameInput): ReferenceFrame => {
  const { lock, focus } = input
  const x = getCoord(focus, 'x')
  const y = getCoord(focus, 'y')
  const z = getCoord(focus, 'z')

  let plane: ReferencePlane
  let normalAxis: 'x' | 'y' | 'z'
  let normalValue: number

  if (lock === 'x') {
    plane = 'yz'
    normalAxis = 'x'
    normalValue = x
  } else if (lock === 'y') {
    plane = 'xz'
    normalAxis = 'y'
    normalValue = y
  } else if (lock === 'z') {
    plane = 'xy'
    normalAxis = 'z'
    normalValue = z
  } else {
    // Free view: floor slice passes through camera target elevation Y
    plane = 'xz'
    normalAxis = 'y'
    normalValue = y
  }

  const origin: readonly [number, number, number] = [x, y, z]
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
