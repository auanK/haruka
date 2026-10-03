import { Group, Sprite } from 'three'
import { cubeVertices, type CubeVertex } from '../app/didactic-cube'
import { createTextSprite } from './text-sprite'

export type VertexLabels = {
  readonly group: Group
  readonly update: (vertices: readonly CubeVertex[]) => void
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

  return {
    group,
    update: (vertices: readonly CubeVertex[]) => {
      for (const vertex of vertices) {
        const label = group.getObjectByName(`vertex-label-${vertex.id}`)
        if (label instanceof Sprite) {
          label.position.set(...vertex.point)
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
