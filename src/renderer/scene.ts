import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshNormalMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three'
import type { CubeVertex } from '../app/didactic-cube'
import { identity } from '../domain'
import { createAdaptiveGrid, type AdaptiveGrid } from './adaptive-grid'
import { createCoordinateLabels, type CoordinateLabels } from './coordinate-labels'
import { applyHarukaMatrixToObject } from './three-matrix'
import { createVertexLabels } from './vertex-labels'

export type HarukaScene = {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly target: Group
  readonly grid: AdaptiveGrid
  readonly coordinateLabels: CoordinateLabels
  readonly updateVertexLabels: (vertices: readonly CubeVertex[]) => void
  readonly updateScene: (width: number, height: number, focusTarget?: Vector3) => void
  readonly dispose: () => void
}

export const createHarukaScene = (): HarukaScene => {
  const scene = new Scene()
  scene.background = new Color(0x151a20)
  const camera = new PerspectiveCamera(45, 1, 0.1, 1000)
  camera.position.set(9, 7, 12)
  camera.lookAt(0, 0, 0)

  const target = new Group()
  applyHarukaMatrixToObject(target, identity())
  const material = new MeshNormalMaterial()
  const body = new Mesh(new BoxGeometry(1, 1, 1), material)
  target.add(body)

  const grid = createAdaptiveGrid()
  const vertexLabels = createVertexLabels()
  const coordinateLabels = createCoordinateLabels()
  scene.add(target, grid.group, vertexLabels.group, coordinateLabels.group)
  const defaultFocus = new Vector3()

  const updateScene = (width: number, height: number, focusTarget?: Vector3) => {
    grid.update(camera, width, height, focusTarget)
    coordinateLabels.update(camera, focusTarget ?? defaultFocus, width, height)
  }

  return {
    scene,
    camera,
    target,
    grid,
    coordinateLabels,
    updateVertexLabels: vertexLabels.update,
    updateScene,
    dispose: () => {
      vertexLabels.dispose()
      coordinateLabels.dispose()
      grid.dispose()
      body.geometry.dispose()
      material.dispose()
      scene.clear()
    },
  }
}
