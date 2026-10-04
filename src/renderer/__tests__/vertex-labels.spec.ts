// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasTexture, Group, Matrix4, OrthographicCamera, Sprite, Vector3 } from 'three'
import { cubeVertices, transformCubeVertices } from '../../app/didactic-cube'
import { toMatrix, type Transform } from '../../domain'
import { createVertexLabels } from '../vertex-labels'
import { mockCanvas2D } from './canvas-2d'

beforeEach(() => mockCanvas2D())
afterEach(() => vi.restoreAllMocks())

describe('createVertexLabels', () => {
  it('creates one sprite per canonical vertex with stable IDs and exact positions', () => {
    const { group, dispose } = createVertexLabels()

    expect(group).toBeInstanceOf(Group)
    expect(group.name).toBe('vertex-labels')
    expect(group.children).toHaveLength(8)
    expect(new Set(group.children.map((label) => label.name)).size).toBe(8)
    for (const vertex of cubeVertices) {
      const label = group.getObjectByName(`vertex-label-${vertex.id}`) as Sprite
      expect(label).toBeInstanceOf(Sprite)
      expect(label.position.toArray()).toEqual(vertex.point)
      expect(label.material.map).toBeInstanceOf(CanvasTexture)
      expect(label.scale.x).toBeLessThan(1)
      expect(label.scale.y).toBeLessThan(1)
    }

    dispose()
  })

  it.each<Transform>([
    { type: 'translation', x: 2, y: 3, z: 4 },
    { type: 'scale', x: -2, y: 3, z: 0.5 },
    { type: 'reflection', plane: 'yz' },
    { type: 'shear', kxy: 2, kxz: 0.5, kyx: -1, kyz: 0, kzx: 0, kzy: 0 },
  ])(
    'updates from supplied $type vertices without deforming label scale or orientation',
    (transform) => {
      const { group, update, dispose } = createVertexLabels()
      const before = group.children.map((label) => ({
        label,
        scale: label.scale.clone(),
        quaternion: label.quaternion.clone(),
      }))
      const vertices = transformCubeVertices(toMatrix(transform))

      update(vertices)
      group.updateMatrixWorld()

      expect(group.matrix).toEqual(new Matrix4())
      for (const [index, vertex] of vertices.entries()) {
        const { label, scale, quaternion } = before[index]!
        expect(group.getObjectByName(`vertex-label-${vertex.id}`)).toBe(label)
        expect(label.position.toArray()).toEqual(vertex.point)
        expect(label.getWorldPosition(new Vector3()).toArray()).toEqual(vertex.point)
        expect(label.scale).toEqual(scale)
        expect(label.quaternion).toEqual(quaternion)
      }

      dispose()
    },
  )

  it('disposes each owned texture and material once, preserving Three shared sprite geometry', () => {
    const { group, dispose } = createVertexLabels()
    const labels = group.children as Sprite[]
    const disposeCounts = new Map<object, number>()
    for (const label of labels) {
      for (const resource of [label.material.map!, label.material]) {
        disposeCounts.set(resource, 0)
        resource.addEventListener('dispose', () => {
          disposeCounts.set(resource, disposeCounts.get(resource)! + 1)
        })
      }
    }
    const geometryDisposed = vi.fn<() => void>()
    labels[0]!.geometry.addEventListener('dispose', geometryDisposed)

    dispose()

    expect(disposeCounts.size).toBe(16)
    expect([...disposeCounts.values()]).toEqual(Array(16).fill(1))
    expect(geometryDisposed).not.toHaveBeenCalled()
    expect(group.children).toHaveLength(0)
    labels[0]?.geometry.removeEventListener('dispose', geometryDisposed)
  })

  it('occludes rear vertex labels when 2D view lock is active and restores all when unlocked', () => {
    const { group, update, dispose } = createVertexLabels()
    const orthoCam = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100)
    orthoCam.position.set(10, 0, 0)
    orthoCam.lookAt(0, 0, 0)
    orthoCam.up.set(0, 1, 0)
    orthoCam.updateMatrixWorld()
    orthoCam.updateProjectionMatrix()

    // 2D lock active along X
    update(cubeVertices, orthoCam, true)

    const visibleLabels = group.children.filter((child) => child.visible)
    const hiddenLabels = group.children.filter((child) => !child.visible)

    expect(visibleLabels).toHaveLength(4)
    expect(hiddenLabels).toHaveLength(4)

    // The front vertices (X = 0.5, closer to camera at +X) must be visible
    for (const v of cubeVertices.filter((v) => v.point[0] === 0.5)) {
      expect(group.getObjectByName(`vertex-label-${v.id}`)?.visible).toBe(true)
    }
    // The rear vertices (X = -0.5) must be hidden
    for (const v of cubeVertices.filter((v) => v.point[0] === -0.5)) {
      expect(group.getObjectByName(`vertex-label-${v.id}`)?.visible).toBe(false)
    }

    // When unlocked, all 8 labels are visible
    update(cubeVertices, orthoCam, false)
    expect(group.children.filter((child) => child.visible)).toHaveLength(8)

    dispose()
  })
})
