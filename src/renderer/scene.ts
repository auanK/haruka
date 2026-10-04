import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Camera,
} from 'three'
import type { CubeVertex } from '../app/didactic-cube'
import { identity } from '../domain'
import { createAdaptiveGrid, type AdaptiveGrid } from './adaptive-grid'
import { createCoordinateLabels, type CoordinateLabels } from './coordinate-labels'
import { applyHarukaMatrixToObject } from './three-matrix'
import { createVertexLabels } from './vertex-labels'
import { viewportTheme } from './viewport-theme'

export type HarukaScene = {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly target: Group
  readonly body: Mesh
  readonly setHighlight: (selected: boolean) => void
  readonly grid: AdaptiveGrid
  readonly coordinateLabels: CoordinateLabels
  readonly updateVertexLabels: (
    vertices: readonly CubeVertex[],
    camera?: Camera,
    is2DLock?: boolean,
  ) => void
  readonly updateScene: (
    width: number,
    height: number,
    focusTarget?: Vector3,
    activeCam?: Camera,
    activePlane?: 'xz' | 'yz' | 'xy',
  ) => void
  readonly dispose: () => void
}

export const createHarukaScene = (): HarukaScene => {
  const scene = new Scene()
  scene.background = new Color(viewportTheme.background)
  const camera = new PerspectiveCamera(45, 1, 0.1, 1000)
  camera.position.set(9, 7, 12)
  camera.lookAt(0, 0, 0)

  const target = new Group()
  applyHarukaMatrixToObject(target, identity())
  const materials = [0x29272d, 0x85838b, 0xd0ced3].map(
    (color) =>
      new MeshLambertMaterial({
        color,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
  )
  // ±X, ±Y, ±Z: opposite faces differ; the initial +X/+Y/+Z view shows three tones.
  const body = new Mesh(
    new BoxGeometry(1, 1, 1),
    [0, 2, 2, 1, 1, 0].map((index) => materials[index]!),
  )
  const edgeMaterial = new LineBasicMaterial({ color: 0xa8a6af })
  const edges = new LineSegments(new EdgesGeometry(body.geometry), edgeMaterial)
  target.add(body, edges)

  const setHighlight = (selected: boolean) => {
    edgeMaterial.color.setHex(selected ? 0x5bc2e8 : 0xa8a6af)
  }

  const ambientLight = new AmbientLight(0xffffff, 2.2)
  const directionalLight = new DirectionalLight(0xffffff, 1.2)
  directionalLight.position.set(4, 6, 8)
  scene.add(ambientLight, directionalLight)

  const grid = createAdaptiveGrid()
  const vertexLabels = createVertexLabels()
  const coordinateLabels = createCoordinateLabels()
  scene.add(target, grid.group, vertexLabels.group, coordinateLabels.group)
  const defaultFocus = new Vector3()

  const updateScene = (
    width: number,
    height: number,
    focusTarget?: Vector3,
    activeCam?: Camera,
    activePlane?: 'xz' | 'yz' | 'xy',
  ) => {
    const cam = activeCam ?? camera
    grid.update(cam, width, height, focusTarget, activePlane)
    coordinateLabels.update(cam, focusTarget ?? defaultFocus, width, height)
  }

  return {
    scene,
    camera,
    target,
    body,
    setHighlight,
    grid,
    coordinateLabels,
    updateVertexLabels: vertexLabels.update,
    updateScene,
    dispose: () => {
      vertexLabels.dispose()
      coordinateLabels.dispose()
      grid.dispose()
      body.geometry.dispose()
      materials.forEach((material) => material.dispose())
      edges.geometry.dispose()
      edgeMaterial.dispose()
      scene.clear()
    },
  }
}
