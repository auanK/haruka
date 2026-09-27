import { describe, it, expect } from 'vitest'
import { multiply } from '../matrix'
import { transformPoint, type Point3 } from '../point'
import { toMatrix, type Translation, type Rotation, type Scale } from '../transform'

describe('Transformation composition and properties', () => {
  it('demonstrates non-commutativity: R · T ≠ T · R on both matrix and point', () => {
    const t: Translation = { type: 'translation', x: 10, y: 0, z: 0 }
    const r: Rotation = { type: 'rotation', axis: 'z', angle: Math.PI / 2 }

    const tMat = toMatrix(t)
    const rMat = toMatrix(r)

    // Order 1: Translate then Rotate: M1 = R · T
    const rtMat = multiply(rMat, tMat)
    // Order 2: Rotate then Translate: M2 = T · R
    const trMat = multiply(tMat, rMat)

    // Matrices are not equal
    expect(rtMat).not.toEqual(trMat)

    const origin: Point3 = [0, 0, 0]
    const pRotatedAfterTrans = transformPoint(rtMat, origin)
    const pTranslatedAfterRot = transformPoint(trMat, origin)

    // (R · T) · (0,0,0) -> R · (10,0,0) -> (0, 10, 0)
    expect(pRotatedAfterTrans[0]).toBeCloseTo(0, 5)
    expect(pRotatedAfterTrans[1]).toBeCloseTo(10, 5)
    expect(pRotatedAfterTrans[2]).toBeCloseTo(0, 5)

    // (T · R) · (0,0,0) -> T · (0,0,0) -> (10, 0, 0)
    expect(pTranslatedAfterRot[0]).toBeCloseTo(10, 5)
    expect(pTranslatedAfterRot[1]).toBeCloseTo(0, 5)
    expect(pTranslatedAfterRot[2]).toBeCloseTo(0, 5)

    expect(pRotatedAfterTrans).not.toEqual(pTranslatedAfterRot)
  })

  it('verifies the composition convention intended for the transformation stack: Mfinal = S · R · T', () => {
    const t: Translation = { type: 'translation', x: 1, y: 0, z: 0 }
    const r: Rotation = { type: 'rotation', axis: 'z', angle: Math.PI / 2 }
    const s: Scale = { type: 'scale', x: 2, y: 2, z: 2 }

    const tMat = toMatrix(t)
    const rMat = toMatrix(r)
    const sMat = toMatrix(s)

    // Mfinal = S · (R · T)
    const mFinal = multiply(sMat, multiply(rMat, tMat))

    const p: Point3 = [0, 0, 0]
    // 1. T · [0, 0, 0] = [1, 0, 0]
    // 2. R · [1, 0, 0] = [0, 1, 0]
    // 3. S · [0, 1, 0] = [0, 2, 0]
    const transformed = transformPoint(mFinal, p)

    expect(transformed[0]).toBeCloseTo(0, 5)
    expect(transformed[1]).toBeCloseTo(2, 5)
    expect(transformed[2]).toBeCloseTo(0, 5)
  })
})
