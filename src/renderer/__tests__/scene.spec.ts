// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Color,
  BoxGeometry,
  GridHelper,
  Group,
  Matrix4,
  Mesh,
  LineSegments,
  PerspectiveCamera,
  Scene,
  Sprite,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { toMatrix } from '../../domain'
import { applyHarukaMatrixToObject } from '../three-matrix'
import { createHarukaScene } from '../scene'
import { mockCanvas2D } from './canvas-2d'

beforeEach(() => {
  mockCanvas2D()
})
afterEach(() => vi.restoreAllMocks())

describe('createHarukaScene', () => {
  it('creates a perspective scene with an attached Haruka-controlled target at identity', () => {
    const { scene, camera, target, dispose } = createHarukaScene()

    expect(scene).toBeInstanceOf(Scene)
    expect(scene.background).toEqual(new Color(0x151a20))
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

  it('keeps adaptive ground grid at the global origin independently of the target matrix', () => {
    const { scene, target, dispose } = createHarukaScene()
    const gridGroup = scene.children.find((child) => child.name === 'adaptive-grid')

    expect(gridGroup).toBeInstanceOf(Group)
    expect(gridGroup?.parent).toBe(scene)

    applyHarukaMatrixToObject(target, toMatrix({ type: 'translation', x: 4, y: 5, z: 6 }))
    scene.updateMatrixWorld()

    expect(gridGroup?.getWorldPosition(new Vector3()).toArray()).toEqual([0, 0, 0])
    expect(target.getWorldPosition(new Vector3()).toArray()).toEqual([4, 5, 6])

    dispose()
  })

  it('builds one centered unit cube and eight global labels at its canonical vertices', () => {
    const { scene, target, dispose } = createHarukaScene()
    const meshes = target.children.filter((child) => child instanceof Mesh)

    expect(meshes).toHaveLength(1)
    expect(meshes[0]!.geometry).toBeInstanceOf(BoxGeometry)
    expect((meshes[0]!.geometry as BoxGeometry).parameters).toMatchObject({
      width: 1,
      height: 1,
      depth: 1,
    })
    expect(meshes[0]!.position.lengthSq()).toBe(0)
    expect(meshes[0]!.visible && meshes[0]!.matrixAutoUpdate).toBe(true)
    const labels = scene.getObjectByName('vertex-labels')!
    expect(labels.parent).toBe(scene)
    expect(labels.children).toHaveLength(8)
    expect(target.children.some((child) => child instanceof Sprite)).toBe(false)
    for (let index = 1; index <= 8; index++) {
      expect(labels.getObjectByName(`vertex-label-V${index}`)).toBeInstanceOf(Sprite)
    }

    dispose()
  })

  it('provides an adaptive procedural ground grid without legacy fixed GridHelper or ±100 coordinate-guides', () => {
    const { scene, dispose } = createHarukaScene()

    const gridHelper = scene.children.find((child) => child instanceof GridHelper)
    expect(gridHelper).toBeUndefined()

    const legacyGuides = scene.children.find((child) => child.name === 'coordinate-guides')
    expect(legacyGuides).toBeUndefined()

    const adaptiveGrid = scene.children.find((child) => child.name === 'adaptive-grid') as Group
    expect(adaptiveGrid).toBeInstanceOf(Group)
    expect(adaptiveGrid.getObjectByName('adaptive-ground-grid')).toBeInstanceOf(Mesh)
    expect(adaptiveGrid.getObjectByName('adaptive-axis-y')).toBeInstanceOf(LineSegments)

    dispose()
  })

  it('disposes every owned geometry and material once, including grid and vertex labels', () => {
    const { scene, dispose } = createHarukaScene()
    const resources = new Set<BufferGeometry | Material | Texture>()
    scene.traverse((object) => {
      if (object instanceof Mesh || object instanceof LineSegments) {
        resources.add(object.geometry)
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => resources.add(material))
      }
      if (object instanceof Sprite) {
        resources.add(object.material)
        resources.add(object.material.map!)
      }
    })
    const counts = new Map([...resources].map((resource) => [resource, 0]))
    resources.forEach((resource) => {
      vi.spyOn(resource, 'dispose').mockImplementation(() => {
        counts.set(resource, (counts.get(resource) ?? 0) + 1)
      })
    })

    dispose()

    expect(counts.size).toBeGreaterThan(0)
    for (const [resource, count] of counts.entries()) {
      expect(count, `Expected resource ${resource.constructor.name} to be disposed once`).toBe(1)
    }
    expect(scene.children).toHaveLength(0)
  })
})
