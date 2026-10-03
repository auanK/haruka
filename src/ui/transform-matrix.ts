import {
  toMatrix,
  type ReflectionPlane,
  type Shear,
  type Transform,
  type Translation,
} from '../domain'
import { formatMatrixValue, radiansToDegrees } from './transform-stack'

export type TransformNumberField = Exclude<keyof Translation | keyof Shear, 'type'>

export type TransformMatrixCell = { readonly index: number; readonly text: string } & (
  | { readonly kind: 'readonly' }
  | {
      readonly kind: 'number'
      readonly field: TransformNumberField
      readonly value: number
      readonly label: string
    }
  | {
      readonly kind: 'rotation'
      readonly expression: 'cos' | 'sen' | '-sen'
      readonly degrees: number
      readonly label: string
    }
  | {
      readonly kind: 'reflection'
      readonly plane: ReflectionPlane
      readonly active: boolean
      readonly label: string
    }
)

const numberFields = {
  translation: [
    [3, 'x'],
    [7, 'y'],
    [11, 'z'],
  ],
  scale: [
    [0, 'x'],
    [5, 'y'],
    [10, 'z'],
  ],
  shear: [
    [1, 'kxy'],
    [2, 'kxz'],
    [4, 'kyx'],
    [6, 'kyz'],
    [8, 'kzx'],
    [9, 'kzy'],
  ],
} as const

const rotationExpressions = {
  x: [
    [5, 'cos'],
    [6, '-sen'],
    [9, 'sen'],
    [10, 'cos'],
  ],
  y: [
    [0, 'cos'],
    [2, 'sen'],
    [8, '-sen'],
    [10, 'cos'],
  ],
  z: [
    [0, 'cos'],
    [1, '-sen'],
    [4, 'sen'],
    [5, 'cos'],
  ],
} as const

/** Derived UI only: indices describe semantic controls, never arbitrary matrix edits. */
export const deriveTransformMatrixCells = (
  transform: Transform,
): readonly TransformMatrixCell[] => {
  const matrix = toMatrix(transform)
  const cells: TransformMatrixCell[] = matrix.map((value, index) => ({
    kind: 'readonly',
    index,
    text: formatMatrixValue(value),
  }))
  if (transform.type === 'rotation') {
    const degrees = radiansToDegrees(transform.angle)
    for (const [index, expression] of rotationExpressions[transform.axis]) {
      cells[index] = {
        kind: 'rotation',
        index,
        expression,
        degrees,
        text: `${expression}(${formatMatrixValue(degrees)}°)`,
        label: `Rotation angle through ${expression} cell (row ${Math.floor(index / 4) + 1}, column ${(index % 4) + 1})`,
      }
    }
  } else if (transform.type === 'reflection') {
    for (const [index, plane] of [
      [0, 'yz'],
      [5, 'xz'],
      [10, 'xy'],
    ] as const) {
      cells[index] = {
        kind: 'reflection',
        index,
        plane,
        active: transform.plane === plane,
        text: cells[index]!.text,
        label: `Reflect across ${plane.toUpperCase()}`,
      }
    }
  } else {
    for (const [index, field] of numberFields[transform.type]) {
      const label =
        transform.type === 'shear'
          ? `Shear ${field.charAt(1).toUpperCase()} ← ${field.charAt(2).toUpperCase()} (${field}) matrix cell`
          : `${transform.type === 'translation' ? 'Translation' : 'Scale'} ${field.toUpperCase()} matrix cell`
      cells[index] = {
        kind: 'number',
        index,
        field,
        label,
        value: matrix[index]!,
        text: cells[index]!.text,
      }
    }
  }
  return cells
}
