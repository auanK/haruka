import { describe, it, expect } from 'vitest'
import { Matrix4 as ThreeMatrix4, Object3D, Vector3 } from 'three'
import {
  composeTransforms,
  multiply,
  toMatrix,
  transformPoint,
  type Matrix4,
  type Transform,
} from '../../domain'
import {
  createTransformStackState,
  moveTransformOperation,
  type TransformStackState,
} from '../../app/transform-stack-state'
import {
  writeThreeMatrix,
  applyHarukaMatrixToObject,
  applyTransformStackStateToObject,
} from '../three-matrix'

const translation: Transform = Object.freeze({ type: 'translation', x: 1, y: 0, z: 0 })
const rotation: Transform = Object.freeze({ type: 'rotation', axis: 'z', angle: Math.PI / 2 })
const scale: Transform = Object.freeze({ type: 'scale', x: 2, y: 3, z: 4 })
const shear: Transform = Object.freeze({
  type: 'shear',
  kxy: 2,
  kxz: 0,
  kyx: 0,
  kyz: 0,
  kzx: 0,
  kzy: 0,
})
const reflection: Transform = Object.freeze({ type: 'reflection', plane: 'yz' })
const state: TransformStackState = Object.freeze({
  operations: Object.freeze([
    Object.freeze({ id: 'op-s', transform: scale }),
    Object.freeze({ id: 'op-r', transform: rotation }),
    Object.freeze({ id: 'op-t', transform: translation }),
  ]),
})

describe('writeThreeMatrix', () => {
  it('fully overwrites a reused matrix with the correct asymmetric layout without mutating input', () => {
    // prettier-ignore
    const matrix: Matrix4 = Object.freeze([
       1,  2,  3,  4,
       5,  6,  7,  8,
       9, 10, 11, 12,
      13, 14, 15, 16,
    ])
    const out = new ThreeMatrix4()
    const elements = out.elements
    elements.fill(99)

    writeThreeMatrix(out, matrix)

    expect(out.elements).toBe(elements)
    // prettier-ignore
    expect(out.elements).toEqual([
      1, 5,  9, 13,
      2, 6, 10, 14,
      3, 7, 11, 15,
      4, 8, 12, 16,
    ])
    expect(matrix).toEqual(Array.from({ length: 16 }, (_, index) => index + 1))
  })

  it('matches domain point transformation for application sequence [T, R]', () => {
    const matrix = Object.freeze(composeTransforms(Object.freeze([translation, rotation])))
    const point = Object.freeze([2, 3, 4] as const)
    const expected = transformPoint(matrix, point)
    const out = new ThreeMatrix4()

    writeThreeMatrix(out, matrix)

    const actual = new Vector3(...point).applyMatrix4(out)
    expect(actual.x).toBeCloseTo(expected[0], 12)
    expect(actual.y).toBeCloseTo(expected[1], 12)
    expect(actual.z).toBeCloseTo(expected[2], 12)
    expect(actual.x).toBeCloseTo(-3, 12)
    expect(actual.y).toBeCloseTo(3, 12)
    expect(actual.z).toBe(4)
  })

  it.each([
    [shear, [11, 4, 5]],
    [reflection, [-3, 4, 5]],
    [Object.freeze({ type: 'scale', x: -2, y: 3, z: 4 }), [-6, 12, 20]],
  ] as const)('preserves $0.type geometry without decomposition', (transform, expected) => {
    const matrix = Object.freeze(toMatrix(transform))
    const point = Object.freeze([3, 4, 5] as const)
    const out = new ThreeMatrix4()

    writeThreeMatrix(out, matrix)

    const actual = new Vector3(...point).applyMatrix4(out).toArray()
    expect(actual).toEqual(transformPoint(matrix, point))
    expect(actual).toEqual(expected)
  })
})

describe('applyHarukaMatrixToObject', () => {
  it('writes the owned local matrix, disables recomposition and marks the world matrix dirty', () => {
    const object = new Object3D()
    const localMatrix = object.matrix
    object.position.set(7, 8, 9)
    object.rotation.set(0.4, 0.5, 0.6)
    object.scale.set(5, 6, 7)
    const position = object.position.toArray()
    const quaternion = object.quaternion.toArray()
    const objectScale = object.scale.toArray()
    const matrix = Object.freeze(composeTransforms(Object.freeze([shear, reflection])))
    expect(object.matrixAutoUpdate).toBe(true)
    expect(object.matrixWorldNeedsUpdate).toBe(false)

    applyHarukaMatrixToObject(object, matrix)

    expect(object.matrix).toBe(localMatrix)
    // prettier-ignore
    expect(object.matrix.elements).toEqual([
      -1, 0, 0, 0,
      -2, 1, 0, 0,
       0, 0, 1, 0,
       0, 0, 0, 1,
    ])
    expect(object.matrixAutoUpdate).toBe(false)
    expect(object.matrixWorldNeedsUpdate).toBe(true)
    expect(object.matrixWorldAutoUpdate).toBe(true)

    object.updateMatrixWorld()

    expect(object.matrixWorld.elements).toEqual(object.matrix.elements)
    expect(object.matrixWorldNeedsUpdate).toBe(false)
    expect(new Vector3(3, 4, 5).applyMatrix4(object.matrixWorld).toArray()).toEqual([-11, 4, 5])
    expect(object.position.toArray()).toEqual(position)
    expect(object.quaternion.toArray()).toEqual(quaternion)
    expect(object.scale.toArray()).toEqual(objectScale)
  })

  it('leaves Three.js world propagation working for parents and children', () => {
    const parent = new Object3D()
    const object = new Object3D()
    const child = new Object3D()
    parent.position.set(10, 0, 0)
    child.position.set(3, 4, 5)
    parent.add(object)
    object.add(child)

    applyHarukaMatrixToObject(object, composeTransforms([shear, reflection]))
    parent.updateMatrixWorld()

    expect(new Vector3().applyMatrix4(child.matrixWorld).toArray()).toEqual([-1, 4, 5])
    expect(object.matrixWorldAutoUpdate).toBe(true)
  })

  it('overwrites A with B instead of accumulating matrices', () => {
    const object = new Object3D()
    const localMatrix = object.matrix
    const first = Object.freeze(toMatrix(translation))
    const second = Object.freeze(composeTransforms(Object.freeze([shear, reflection])))
    applyHarukaMatrixToObject(object, first)
    object.updateMatrixWorld()
    expect(object.matrixWorldNeedsUpdate).toBe(false)

    applyHarukaMatrixToObject(object, second)

    expect(object.matrix).toBe(localMatrix)
    expect(object.matrix.elements).toEqual(new ThreeMatrix4().set(...second).elements)
    expect(new Vector3(3, 4, 5).applyMatrix4(object.matrix).toArray()).toEqual([-11, 4, 5])
    expect(object.matrixWorldNeedsUpdate).toBe(true)
  })
})

describe('applyTransformStackStateToObject', () => {
  it('restores identity for an empty application stack instead of keeping the previous matrix', () => {
    const object = new Object3D()
    object.matrix.makeTranslation(7, 8, 9)

    applyTransformStackStateToObject(object, createTransformStackState())

    expect(object.matrix.elements).toEqual(new ThreeMatrix4().elements)
    expect(object.matrixAutoUpdate).toBe(false)
    expect(object.matrixWorldNeedsUpdate).toBe(true)
  })

  it('applies visual/product [S, R, T] as S · R · T without mutating state, operations or transforms', () => {
    const object = new Object3D()
    const snapshot = structuredClone(state)
    const expected = multiply(toMatrix(scale), multiply(toMatrix(rotation), toMatrix(translation)))

    applyTransformStackStateToObject(object, state)

    expect(object.matrix.elements).toEqual(new ThreeMatrix4().set(...expected).elements)
    const point = new Vector3(2, 3, 4).applyMatrix4(object.matrix)
    expect(point.x).toBeCloseTo(-6, 12)
    expect(point.y).toBeCloseTo(9, 12)
    expect(point.z).toBe(16)
    expect(state).toEqual(snapshot)
    expect(object.matrixAutoUpdate).toBe(false)
    expect(object.matrixWorldNeedsUpdate).toBe(true)
  })

  it('corrects renderer drift when authoritative visual/product order [S, R, T] is reapplied', () => {
    const object = new Object3D()
    const expected = composeTransforms([translation, rotation, scale])
    applyTransformStackStateToObject(object, state)
    object.updateMatrixWorld()
    object.matrix.elements.fill(99)
    expect(object.matrixWorldNeedsUpdate).toBe(false)

    applyTransformStackStateToObject(object, state)

    expect(object.matrix.elements).toEqual(new ThreeMatrix4().set(...expected).elements)
    expect(object.matrixWorldNeedsUpdate).toBe(true)
    object.updateMatrixWorld()
    expect(object.matrixWorld.elements).toEqual(new ThreeMatrix4().set(...expected).elements)
  })

  it('changes the rendered product from R · T to T · R when T moves up visually', () => {
    const object = new Object3D()
    const original: TransformStackState = Object.freeze({
      operations: Object.freeze(state.operations.slice(1)),
    })
    applyTransformStackStateToObject(object, original)
    const before = [...object.matrix.elements]
    const beforePoint = new Vector3().applyMatrix4(object.matrix)
    expect(beforePoint.x).toBeCloseTo(0, 12)
    expect(beforePoint.y).toBeCloseTo(1, 12)
    expect(beforePoint.z).toBe(0)
    const moved = moveTransformOperation(original, 'op-t', 0)
    expect(moved.ok).toBe(true)
    if (!moved.ok) throw new Error(moved.reason)

    applyTransformStackStateToObject(object, moved.state)

    const expected = multiply(toMatrix(translation), toMatrix(rotation))
    expect(object.matrix.elements).toEqual(new ThreeMatrix4().set(...expected).elements)
    expect(object.matrix.elements).not.toEqual(before)
    expect(new Vector3().applyMatrix4(object.matrix).toArray()).toEqual([1, 0, 0])
    expect(original.operations).toEqual(state.operations.slice(1))
  })
})
