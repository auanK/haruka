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

export const formatMatrixValue = (value: number): string => String(Number(value.toFixed(4)))

export const formatNumber = formatMatrixValue
