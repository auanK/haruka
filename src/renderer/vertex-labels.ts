import { Group, Sprite, Vector3, type Camera } from 'three'
import { cubeVertices, type CubeVertex } from '../app/didactic-cube'
import { createTextSprite } from './text-sprite'

export type VertexLabels = {
  readonly group: Group
  readonly update: (vertices: readonly CubeVertex[], camera?: Camera, is2DLock?: boolean) => void
  readonly dispose: () => void
}

export const createVertexLabels = (): VertexLabels => {
  const group = new Group()
  group.name = 'vertex-labels'

  for (const vertex of cubeVertices) {
    const label = createTextSprite(vertex.id, '#85b7ef')
    label.name = `vertex-label-${vertex.id}`
    label.position.set(...vertex.point)
    label.scale.set(0.36, 0.18, 1)
    delete (label.quaternion as unknown as { _onChangeCallback?: unknown })._onChangeCallback
    group.add(label)
  }

  const projectedVec = new Vector3()

  return {
    group,
    update: (vertices: readonly CubeVertex[], camera?: Camera, is2DLock = false) => {
      for (const vertex of vertices) {
        const label = group.getObjectByName(`vertex-label-${vertex.id}`)
        if (label instanceof Sprite) {
          label.position.set(...vertex.point)
          label.visible = true
        }
      }

      if (!is2DLock || !camera) return

      camera.updateMatrixWorld()
      const projected = vertices.map((vertex) => {
        const p = projectedVec.set(...vertex.point).project(camera)
        return { id: vertex.id, x: p.x, y: p.y, z: p.z }
      })

      for (let i = 0; i < projected.length; i++) {
        const a = projected[i]!
        for (let j = i + 1; j < projected.length; j++) {
          const b = projected[j]!
          if (Math.hypot(a.x - b.x, a.y - b.y) < 0.04) {
            const rearId = a.z > b.z ? a.id : b.id
            const rearLabel = group.getObjectByName(`vertex-label-${rearId}`)
            if (rearLabel instanceof Sprite) {
              rearLabel.visible = false
            }
          }
        }
      }
    },
    dispose: () => {
      for (const child of group.children) {
        if (child instanceof Sprite) {
          child.material.map?.dispose()
          child.material.dispose()
        }
      }
      group.clear()
    },
  }
}
