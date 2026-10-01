import { describe, it, expect } from 'vitest'
import {
  composeTransforms,
  composeTransformsInto,
  computeTransformStages,
  createMatrix,
  identity,
  multiply,
  toMatrix,
  transformPoint,
  type Transform,
} from '..'

const translation: Transform = Object.freeze({ type: 'translation', x: 1, y: 0, z: 0 })
const rotation: Transform = Object.freeze({ type: 'rotation', axis: 'z', angle: Math.PI / 2 })
const scale: Transform = Object.freeze({ type: 'scale', x: 2, y: 3, z: 4 })
const reflection: Transform = Object.freeze({ type: 'reflection', plane: 'xy' })
const shear: Transform = Object.freeze({
  type: 'shear',
  kxy: 2,
  kxz: 0,
  kyx: 0,
  kyz: 0,
  kzx: 0,
  kzy: -1,
})
const transforms = Object.freeze([translation, rotation, scale])

describe('composeTransforms', () => {
  it('composes an empty stack to identity', () => {
    expect(composeTransforms([])).toEqual(identity())
  })

  it.each([translation, rotation, scale, reflection, shear])(
    'composes a single $type without mutating it',
    (transform) => {
      const original = { ...transform }
      expect(composeTransforms(Object.freeze([transform]))).toEqual(toMatrix(transform))
      expect(transform).toEqual(original)
    },
  )

  it('applies [T, R, S] as S · R · T without mutating the stack', () => {
    const matrix = composeTransforms(transforms)

    expect(matrix).toEqual(
      multiply(toMatrix(scale), multiply(toMatrix(rotation), toMatrix(translation))),
    )
    const point = transformPoint(matrix, [0, 0, 0])
    expect(point[0]).toBeCloseTo(0)
    expect(point[1]).toBeCloseTo(3)
    expect(point[2]).toBeCloseTo(0)
    expect(transforms).toEqual([translation, rotation, scale])
  })
})

describe('composeTransformsInto', () => {
  it('overwrites a contaminated output buffer with the stack composition', () => {
    const out = createMatrix().fill(99)
    const scratch = createMatrix().fill(-99)
    const expected = composeTransforms(transforms)

    composeTransformsInto(out, transforms, scratch)

    expect(out).toEqual(expected)
    expect(transforms).toEqual([translation, rotation, scale])
  })

  it('resets a reused buffer for an empty stack and a subsequent different stack', () => {
    const out = createMatrix()
    const scratch = createMatrix()
    composeTransformsInto(out, transforms, scratch)
    composeTransformsInto(out, [], scratch)
    expect(out).toEqual(identity())

    composeTransformsInto(out, [shear, reflection], scratch)
    expect(out).toEqual(multiply(toMatrix(reflection), toMatrix(shear)))
  })

  it('can supply its own scratch buffer when none is passed', () => {
    const out = createMatrix().fill(99)

    composeTransformsInto(out, [translation])

    expect(out).toEqual(toMatrix(translation))
  })

  it('rejects aliased output and scratch before changing the output', () => {
    const out = createMatrix().fill(99)
    const original = [...out]

    expect(() => composeTransformsInto(out, transforms, out)).toThrow(/scratch/i)
    expect(out).toEqual(original)
  })
})

describe('computeTransformStages', () => {
  it('returns only stage 0 = I for an empty stack', () => {
    expect(computeTransformStages([])).toEqual([identity()])
  })

  it('returns independent stages I, T, R · T and S · R · T in order', () => {
    const t = toMatrix(translation)
    const rt = multiply(toMatrix(rotation), t)
    const srt = multiply(toMatrix(scale), rt)
    const stages = computeTransformStages(transforms)

    expect(stages).toEqual([identity(), t, rt, srt])
    expect(stages[0]).not.toBe(stages[1])
    expect(stages[1]).not.toBe(stages[2])
    expect(stages[2]).not.toBe(stages[3])
    expect(transforms).toEqual([translation, rotation, scale])
  })

  it('includes the single transform after identity', () => {
    expect(computeTransformStages([shear])).toEqual([identity(), toMatrix(shear)])
  })
})
