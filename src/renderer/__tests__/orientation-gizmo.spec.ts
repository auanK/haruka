// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Group,
  Line,
  PerspectiveCamera,
  Sprite,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { createOrientationGizmo } from '../orientation-gizmo'
import { mockCanvas2D } from './canvas-2d'

beforeEach(mockCanvas2D)
afterEach(() => vi.restoreAllMocks())

describe('orientation gizmo', () => {
  it('contains world X/Y/Z axes and labels in its own orthographic scene', () => {
    const gizmo = createOrientationGizmo()

    expect(gizmo.scene.children).toEqual([gizmo.group])
    expect(gizmo.camera.isOrthographicCamera).toBe(true)
    expect(gizmo.group.children.filter((child) => child instanceof Line)).toHaveLength(3)
    expect(
      gizmo.group.children.filter((child) => child instanceof Sprite).map((child) => child.name),
    ).toEqual(['orientation-label-X', 'orientation-label-Y', 'orientation-label-Z'])

    gizmo.dispose()
  })

  it('derives world orientation from the main camera and remains independent of the target', () => {
    const gizmo = createOrientationGizmo()
    const camera = new PerspectiveCamera()
    camera.position.set(4, 3, 6)
    camera.lookAt(0, 0, 0)

    gizmo.updateOrientation(camera)

    const expected = camera.getWorldQuaternion(camera.quaternion.clone()).invert()
    expect(gizmo.group.quaternion.angleTo(expected)).toBeCloseTo(0)

    const target = new Group()
    target.matrix.makeScale(-2, 3, 4).setPosition(7, 8, 9)
    target.matrixAutoUpdate = false
    target.updateMatrixWorld(true)
    gizmo.updateOrientation(camera)
    expect(gizmo.group.quaternion.angleTo(expected)).toBeCloseTo(0)
    expect(gizmo.group.parent).toBe(gizmo.scene)
    expect(gizmo.group.parent).not.toBe(target)

    camera.position.set(-6, 2, 4)
    camera.lookAt(0, 0, 0)
    gizmo.updateOrientation(camera)
    expect(gizmo.group.quaternion.angleTo(expected)).toBeGreaterThan(0.1)
    expect(gizmo.group.quaternion.angleTo(camera.quaternion.clone().invert())).toBeCloseTo(0)

    gizmo.dispose()
  })

  it('disposes every axis geometry, axis/label material and label texture once', () => {
    const gizmo = createOrientationGizmo()
    const resources = new Set<BufferGeometry | Material | Texture>()
    gizmo.group.traverse((object) => {
      if (object instanceof Line) {
        resources.add(object.geometry)
        resources.add(object.material as Material)
      }
      if (object instanceof Sprite) {
        resources.add(object.material)
        if (object.material.map) resources.add(object.material.map)
      }
    })
    const disposed = [...resources].map((resource) => vi.spyOn(resource, 'dispose'))

    gizmo.dispose()

    expect(resources.size).toBe(12)
    for (const dispose of disposed) expect(dispose).toHaveBeenCalledOnce()
  })
})
