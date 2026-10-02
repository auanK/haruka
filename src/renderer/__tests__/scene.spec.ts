import { describe, expect, it } from 'vitest'
import {
  AxesHelper,
  GridHelper,
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three'
import { toMatrix } from '../../domain'
import { applyHarukaMatrixToObject } from '../three-matrix'
import { createHarukaScene } from '../scene'

describe('createHarukaScene', () => {
  it('creates a perspective scene with an attached Haruka-controlled target at identity', () => {
    const { scene, camera, target, dispose } = createHarukaScene()

    expect(scene).toBeInstanceOf(Scene)
    expect(camera).toBeInstanceOf(PerspectiveCamera)
    expect(target).toBeInstanceOf(Group)
    expect(target.parent).toBe(scene)
    expect(target.matrixAutoUpdate).toBe(false)
    expect(target.matrix.elements).toEqual(new Matrix4().elements)
    expect(target.matrixWorldNeedsUpdate).toBe(true)
    expect(camera.position.x).toBeGreaterThan(0)
    expect(camera.position.y).toBeGreaterThan(0)
    expect(camera.position.z).toBeGreaterThan(0)
    expect(
      camera.getWorldDirection(new Vector3()).dot(camera.position.clone().normalize()),
    ).toBeCloseTo(-1)

    dispose()
  })

  it('keeps grid and axes at the global origin independently of the target matrix', () => {
    const { scene, target, dispose } = createHarukaScene()
    const grid = scene.children.find((child) => child instanceof GridHelper)
    const axes = scene.children.find((child) => child instanceof AxesHelper)

    expect(grid).toBeInstanceOf(GridHelper)
    expect(axes).toBeInstanceOf(AxesHelper)
    expect(grid?.parent).toBe(scene)
    expect(axes?.parent).toBe(scene)

    applyHarukaMatrixToObject(target, toMatrix({ type: 'translation', x: 4, y: 5, z: 6 }))
    scene.updateMatrixWorld()

    expect(grid?.getWorldPosition(new Vector3()).toArray()).toEqual([0, 0, 0])
    expect(axes?.getWorldPosition(new Vector3()).toArray()).toEqual([0, 0, 0])
    expect(target.getWorldPosition(new Vector3()).toArray()).toEqual([4, 5, 6])

    dispose()
  })

  it('builds recognizable asymmetry from visible children with normal local transforms', () => {
    const { target, dispose } = createHarukaScene()
    const meshes = target.children.filter((child) => child instanceof Mesh)

    expect(meshes.length).toBeGreaterThanOrEqual(2)
    expect(meshes.some((mesh) => mesh.position.lengthSq() === 0)).toBe(true)
    expect(
      meshes.some((mesh) => mesh.position.x > 0 && mesh.position.y > 0 && mesh.position.z > 0),
    ).toBe(true)
    expect(meshes.every((mesh) => mesh.visible && mesh.matrixAutoUpdate)).toBe(true)

    dispose()
  })

  it('disposes every owned geometry and material once, including shared materials and global helpers', () => {
    const { scene, dispose } = createHarukaScene()
    const resources = new Set<BufferGeometry | Material>()
    scene.traverse((object) => {
      if (object instanceof Mesh || object instanceof GridHelper || object instanceof AxesHelper) {
        resources.add(object.geometry)
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => resources.add(material))
      }
    })
    const counts = new Map([...resources].map((resource) => [resource, 0]))
    resources.forEach((resource) => {
      resource.addEventListener('dispose', () => {
        counts.set(resource, (counts.get(resource) ?? 0) + 1)
      })
    })

    dispose()

    expect(resources.size).toBeGreaterThan(0)
    expect([...counts.values()].every((count) => count === 1)).toBe(true)
  })
})
