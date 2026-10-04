import type { Transform } from '../domain/transform'

export const createDefaultTransform = (type: Transform['type']): Transform => {
  switch (type) {
    case 'translation':
      return { type, x: 0, y: 0, z: 0 }
    case 'rotation':
      return { type, axis: 'z', angle: 0 }
    case 'scale':
      return { type, x: 1, y: 1, z: 1 }
    case 'reflection':
      return { type, plane: 'yz' }
    case 'shear':
      return { type, kxy: 0, kxz: 0, kyx: 0, kyz: 0, kzx: 0, kzy: 0 }
  }
}

export const parseFiniteNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export const degreesToRadians = (degrees: number): number => degrees * (Math.PI / 180)

export const radiansToDegrees = (radians: number): number => radians * (180 / Math.PI)

export type DisplayPrecision = 0 | 1 | 2 | 3 | 4

export const formatDisplayNumber = (value: number, precision: DisplayPrecision = 4): string => {
  const p = typeof precision === 'number' && precision >= 0 && precision <= 4 ? precision : 4
  const rounded = Number(value.toFixed(p))
  return Object.is(rounded, -0) || rounded === 0 ? '0' : String(rounded)
}

export const formatMatrixValue = (
  value: number,
  precision?: DisplayPrecision | number,
  ...rest: unknown[]
): string => {
  if (rest.length > 0 && Array.isArray(rest[0])) {
    return formatDisplayNumber(value, 4)
  }
  return formatDisplayNumber(
    value,
    typeof precision === 'number' && precision >= 0 && precision <= 4
      ? (precision as DisplayPrecision)
      : 4,
  )
}

export const formatNumber = formatMatrixValue
