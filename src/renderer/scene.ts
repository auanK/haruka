import {
  AxesHelper,
  BoxGeometry,
  GridHelper,
  Group,
  Mesh,
  MeshNormalMaterial,
  PerspectiveCamera,
  Scene,
} from 'three'
import { identity } from '../domain'
import { applyHarukaMatrixToObject } from './three-matrix'

export type HarukaScene = {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly target: Group
  readonly dispose: () => void
}

export const createHarukaScene = (): HarukaScene => {
  const scene = new Scene()
  const camera = new PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(4, 3, 6)
  camera.lookAt(0, 0, 0)

  const target = new Group()
  applyHarukaMatrixToObject(target, identity())
  const material = new MeshNormalMaterial()
  const body = new Mesh(new BoxGeometry(1, 1, 1), material)
  const marker = new Mesh(new BoxGeometry(0.3, 0.3, 0.3), material)
  marker.position.set(1.2, 0.8, 0.3)
  target.add(body, marker)
  const grid = new GridHelper(10, 10)
  const axes = new AxesHelper(2)
  scene.add(target, grid, axes)

  return {
    scene,
    camera,
    target,
    dispose: () => {
      body.geometry.dispose()
      marker.geometry.dispose()
      material.dispose()
      grid.dispose()
      axes.dispose()
    },
  }
}
