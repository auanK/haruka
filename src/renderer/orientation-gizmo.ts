import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  OrthographicCamera,
  Quaternion,
  Scene,
  Sprite,
  type Camera,
} from 'three'
import { createTextSprite } from './text-sprite'

export type OrientationGizmo = {
  readonly scene: Scene
  readonly camera: OrthographicCamera
  readonly group: Group
  readonly updateOrientation: (camera: Camera) => void
  readonly dispose: () => void
}

export const createOrientationGizmo = (): OrientationGizmo => {
  const scene = new Scene()
  const camera = new OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10)
  camera.position.set(0, 0, 2)
  camera.lookAt(0, 0, 0)

  const group = new Group()
  scene.add(group)

  const axes = [
    { axis: 'X', direction: [1, 0, 0] as const, color: '#dd6b70' },
    { axis: 'Y', direction: [0, 1, 0] as const, color: '#80be89' },
    { axis: 'Z', direction: [0, 0, 1] as const, color: '#6e9ddf' },
  ] as const

  const axisLength = 0.7
  const labelDistance = 0.9

  for (const { axis, direction, color } of axes) {
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [0, 0, 0, direction[0] * axisLength, direction[1] * axisLength, direction[2] * axisLength],
        3,
      ),
    )
    const material = new LineBasicMaterial({ color, linewidth: 2 })
    const line = new Line(geometry, material)
    line.name = `orientation-axis-${axis}`

    const label = createTextSprite(axis, color)
    label.name = `orientation-label-${axis}`
    label.position.set(
      direction[0] * labelDistance,
      direction[1] * labelDistance,
      direction[2] * labelDistance,
    )
    label.scale.set(0.52, 0.26, 1)

    group.add(line, label)
  }

  const cameraQuaternion = new Quaternion()

  return {
    scene,
    camera,
    group,
    updateOrientation: (mainCamera: Camera) => {
      mainCamera.getWorldQuaternion(cameraQuaternion)
      group.quaternion.copy(cameraQuaternion.invert())
    },
    dispose: () => {
      for (const child of group.children) {
        if (child instanceof Line) {
          child.geometry.dispose()
          ;(child.material as LineBasicMaterial).dispose()
        }
        if (child instanceof Sprite) {
          child.material.map?.dispose()
          child.material.dispose()
        }
      }
      group.clear()
    },
  }
}
