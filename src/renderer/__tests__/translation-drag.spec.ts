import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import type { Point3 } from '../../domain'
import { deriveTranslationDelta, toNdc } from '../translation-drag'

const camera = (position: Point3) => {
  const result = new PerspectiveCamera(45, 1.5, 0.1, 1000)
  result.position.set(...position)
  result.lookAt(0, 0, 0)
  result.updateMatrixWorld()
  return result
}
const ndcOf = (view: PerspectiveCamera, point: Point3) => {
  const { x, y } = new Vector3(...point).project(view)
  return [x, y] as const
}
describe('toNdc', () => {
  it('uses the real canvas bounds, not the window', () => {
    const rect = { left: 200, top: 50, width: 400, height: 300 }
    expect(toNdc(rect, [200, 50])).toEqual([-1, 1])
    expect(toNdc(rect, [400, 200])).toEqual([0, 0])
    expect(toNdc(rect, [600, 350])).toEqual([1, -1])
  })
})

describe('deriveTranslationDelta', () => {
  it('follows the pointer on a camera-facing plane through the pivot', () => {
    const view = camera([9, 7, 12])
    const pivot: Point3 = [1, 2, 3]
    const moved = new Vector3(...pivot).add(
      new Vector3(1, 0, 0).applyQuaternion(view.quaternion).multiplyScalar(2),
    )
    const expected = new Vector3(1, 0, 0)
      .applyQuaternion(view.quaternion)
      .multiplyScalar(2)
      .toArray()
    const delta = deriveTranslationDelta(
      view,
      ndcOf(view, pivot),
      ndcOf(view, moved.toArray()),
      pivot,
      'free',
    )
    expect(delta).not.toBeNull()
    expected.forEach((value, axis) => expect(delta![axis]).toBeCloseTo(value, 9))
  })

  it.each([
    ['x', [2.5, 0, 0]],
    ['y', [0, -1.25, 0]],
    ['z', [0, 0, 4]],
  ] as const)('projects the pointer onto world %s through the pivot', (axis, delta) => {
    const view = camera([9, 7, 12])
    const pivot: Point3 = [1, 2, 3]
    const target = pivot.map((value, index) => value + delta[index]!) as unknown as Point3
    const result = deriveTranslationDelta(
      view,
      ndcOf(view, pivot),
      ndcOf(view, target),
      pivot,
      axis,
    )
    expect(result).not.toBeNull()
    delta.forEach((value, i) => expect(result![i]).toBeCloseTo(value, 9))
  })

  it('returns only the constrained component for an off-axis pointer', () => {
    const view = camera([9, 7, 12])
    const delta = deriveTranslationDelta(view, ndcOf(view, [0, 0, 0]), [0.3, 0.4], [0, 0, 0], 'x')
    expect(delta![1]).toBe(0)
    expect(delta![2]).toBe(0)
    expect(delta![0]).not.toBe(0)
  })

  it('reports a degenerate gesture instead of an exploding delta', () => {
    const view = camera([0, 0, 10])
    expect(deriveTranslationDelta(view, [0, 0], [0.1, 0.1], [0, 0, 0], 'z')).toBeNull()
    expect(deriveTranslationDelta(view, [0, 0], [0.1, 0.1], [0, 0, 20], 'free')).toBeNull()
  })

  it('moves on YZ plane when X is locked, with delta.x = 0', () => {
    const view = camera([9, 7, 12])
    const pivot: Point3 = [1, 2, 3]
    const target: Point3 = [1, 4, 5]
    const delta = deriveTranslationDelta(
      view,
      ndcOf(view, pivot),
      ndcOf(view, target),
      pivot,
      'free',
      'x',
    )
    expect(delta).not.toBeNull()
    expect(delta![0]).toBe(0)
    expect(delta![1]).toBeCloseTo(2, 6)
    expect(delta![2]).toBeCloseTo(2, 6)
  })

  it('moves on XZ plane when Y is locked, with delta.y = 0', () => {
    const view = camera([9, 7, 12])
    const pivot: Point3 = [1, 2, 3]
    const target: Point3 = [3, 2, 5]
    const delta = deriveTranslationDelta(
      view,
      ndcOf(view, pivot),
      ndcOf(view, target),
      pivot,
      'free',
      'y',
    )
    expect(delta).not.toBeNull()
    expect(delta![0]).toBeCloseTo(2, 6)
    expect(delta![1]).toBe(0)
    expect(delta![2]).toBeCloseTo(2, 6)
  })

  it('moves on XY plane when Z is locked, with delta.z = 0', () => {
    const view = camera([9, 7, 12])
    const pivot: Point3 = [1, 2, 3]
    const target: Point3 = [3, 4, 3]
    const delta = deriveTranslationDelta(
      view,
      ndcOf(view, pivot),
      ndcOf(view, target),
      pivot,
      'free',
      'z',
    )
    expect(delta).not.toBeNull()
    expect(delta![0]).toBeCloseTo(2, 6)
    expect(delta![1]).toBeCloseTo(2, 6)
    expect(delta![2]).toBe(0)
  })

  it('reports null when camera is parallel to the locked plane', () => {
    const view = camera([0, 0, 10])
    expect(deriveTranslationDelta(view, [0, 0], [0.1, 0], [0, 0, 0], 'free', 'x')).toBeNull()
  })
})
