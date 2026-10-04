// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  GridHelper,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshNormalMaterial,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Scene,
  Sprite,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { toMatrix, transformPoint, type Transform } from '../../domain'
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
    expect(scene.background).toEqual(new Color(0x111214))
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
    meshes[0]!.geometry.computeBoundingBox()
    expect(meshes[0]!.geometry.boundingBox!.min.toArray()).toEqual([-0.5, -0.5, -0.5])
    expect(meshes[0]!.geometry.boundingBox!.max.toArray()).toEqual([0.5, 0.5, 0.5])
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

  it('uses three matte solid tones across six asymmetric cube faces', () => {
    const { target, dispose } = createHarukaScene()
    const body = target.children.find((child) => child instanceof Mesh)!

    expect(body).toBeInstanceOf(Mesh)
    expect(body.geometry.getAttribute('color')).toBeUndefined()
    expect(body.geometry).toBeInstanceOf(BoxGeometry)
    const geometry = body.geometry as BoxGeometry
    expect(geometry.parameters).toMatchObject({
      width: 1,
      height: 1,
      depth: 1,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1,
    })
    expect(Array.isArray(body.material)).toBe(true)
    const faceMaterials = body.material as MeshLambertMaterial[]
    expect(faceMaterials).toHaveLength(6)
    const materials = [...new Set(faceMaterials)]
    expect(materials).toHaveLength(3)
    expect(new Set(materials.map((material) => material.color.getHex())).size).toBe(3)
    for (const material of materials) {
      expect(material).not.toBeInstanceOf(MeshNormalMaterial)
      expect(material).toBeInstanceOf(MeshLambertMaterial)
      expect(material.transparent).toBe(false)
      expect(material.opacity).toBe(1)
      expect(material.map).toBeNull()
      expect(material.emissive.getHex()).toBe(0)
      expect(material.color.getHex()).not.toBe(0)
      expect(material.color.getHex()).not.toBe(0xffffff)
      expect(
        Math.max(material.color.r, material.color.g, material.color.b) -
          Math.min(material.color.r, material.color.g, material.color.b),
      ).toBeLessThan(0.05)
    }
    expect(geometry.groups).toHaveLength(6)
    for (const group of geometry.groups) {
      expect(faceMaterials[group.materialIndex!]).toBeInstanceOf(MeshLambertMaterial)
    }
    for (const index of [0, 2, 4]) {
      expect(faceMaterials[index]).not.toBe(faceMaterials[index + 1])
    }
    expect(new Set([faceMaterials[0], faceMaterials[2], faceMaterials[4]]).size).toBe(3)

    dispose()
  })

  it('lights the cube with one ambient and one directional light without shadows', () => {
    const { scene, target, dispose } = createHarukaScene()
    const lights = scene.children.filter(
      (child) => child instanceof AmbientLight || child instanceof DirectionalLight,
    )

    expect(lights).toHaveLength(2)
    expect(lights.filter((light) => light instanceof AmbientLight)).toHaveLength(1)
    expect(lights.filter((light) => light instanceof DirectionalLight)).toHaveLength(1)
    for (const light of lights) expect(light.intensity).toBeGreaterThan(0)
    expect(lights.every((light) => !light.castShadow)).toBe(true)
    expect(target.children.every((child) => !child.castShadow && !child.receiveShadow)).toBe(true)

    dispose()
  })

  it.each<Transform>([
    { type: 'translation', x: 4, y: 5, z: 6 },
    { type: 'rotation', axis: 'x', angle: Math.PI / 3 },
    { type: 'rotation', axis: 'y', angle: Math.PI / 3 },
    { type: 'rotation', axis: 'z', angle: Math.PI / 3 },
    { type: 'scale', x: 2, y: 0.5, z: 3 },
    { type: 'shear', kxy: 0.75, kxz: 0, kyx: 0, kyz: 0.25, kzx: 0, kzy: 0 },
    { type: 'reflection', plane: 'yz' },
    { type: 'reflection', plane: 'xz' },
    { type: 'reflection', plane: 'xy' },
  ])(
    'keeps solid faces and twelve subtle edges on the same authoritative $type matrix',
    (transform) => {
      const { scene, target, dispose } = createHarukaScene()
      const body = target.children.find((child) => child instanceof Mesh)!
      const edges = target.children.find((child) => child instanceof LineSegments)!

      expect(edges).toBeInstanceOf(LineSegments)
      expect(edges.geometry).toBeInstanceOf(EdgesGeometry)
      expect(edges.material).toBeInstanceOf(LineBasicMaterial)
      const edgeMaterial = edges.material as LineBasicMaterial
      expect(edgeMaterial.linewidth).toBe(1)
      expect(edgeMaterial.depthTest).toBe(true)
      expect(edgeMaterial.transparent).toBe(false)
      expect(edgeMaterial.color.getHex()).not.toBe(0xffffff)
      expect(edges.geometry.getAttribute('position').count).toBe(24)

      const matrix = toMatrix(transform)
      const materials = body.material
      expect(body.parent).toBe(target)
      expect(edges.parent).toBe(target)
      applyHarukaMatrixToObject(target, matrix)
      scene.updateMatrixWorld()

      expect(target.matrixAutoUpdate).toBe(false)
      expect(target.matrix.elements).toEqual(new Matrix4().set(...matrix).elements)
      expect(body.matrixWorld.elements).toEqual(target.matrix.elements)
      expect(edges.matrixWorld.elements).toEqual(target.matrix.elements)
      for (const object of [body, edges]) {
        const positions = object.geometry.getAttribute('position')
        for (let index = 0; index < positions.count; index++) {
          const point = new Vector3().fromBufferAttribute(positions, index)
          expect(point.toArray().every((coordinate) => Math.abs(coordinate) <= 0.5)).toBe(true)
          const expected = transformPoint(matrix, [point.x, point.y, point.z])
          const actual = point.applyMatrix4(object.matrixWorld)
          expected.forEach((coordinate, axis) =>
            expect(actual.getComponent(axis)).toBeCloseTo(coordinate, 12),
          )
        }
      }
      expect(body.material).toBe(materials)

      dispose()
    },
  )

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
