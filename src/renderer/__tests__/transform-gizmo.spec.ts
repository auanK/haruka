// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, OrthographicCamera, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import {
  beginTransform,
  createDirectManipulationState,
  selectTarget,
  setGestureConstraint,
} from '../../app/direct-manipulation'
import { cubeVertices } from '../../app/didactic-cube'
import { identity, composeTransforms } from '../../domain'
import { Matrix4 } from 'three'
import { transformCubeVertices } from '../../app/didactic-cube'
import { createTransformGizmo } from '../transform-gizmo'
import { mockCanvas2D } from './canvas-2d'

beforeEach(mockCanvas2D)
const draft = () =>
  beginTransform(
    selectTarget(createDirectManipulationState(), true),
    'rotation',
    cubeVertices,
    [500, 300],
    identity(),
    {
      pivot: [400, 300],
      facing: [0, 0, 1],
      right: [1, 0, 0],
      up: [0, 1, 0],
    },
  )

describe('three-axis rotation gizmo', () => {
  it('offers only the X/Y/Z rotation rings and no free rotation ring', () => {
    const gizmo = createTransformGizmo()
    const state = draft()
    if (state.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft(state)
    expect(gizmo.group.getObjectByName('rotation-ring-free')).toBeUndefined()
    for (const axis of ['x', 'y', 'z'])
      expect(gizmo.group.getObjectByName(`rotation-ring-${axis}`)).toBeDefined()
    gizmo.dispose()
  })
  it('attaches every local axis to the real object matrix and follows nonuniform scale during a drag', () => {
    const gizmo = createTransformGizmo()
    const matrix = composeTransforms([
      { type: 'scale', x: 2, y: 1, z: 4 },
      { type: 'rotation', axis: 'y', angle: 0.7 },
      { type: 'translation', x: 3, y: -2, z: 1 },
    ])
    const state = beginTransform(
      selectTarget(createDirectManipulationState(), true),
      'scale',
      transformCubeVertices(matrix),
      [500, 300],
      matrix,
      { pivot: [400, 300], facing: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
      'local',
    )
    if (state.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft(state, true)
    const model = new Matrix4().set(...matrix)
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000)
    camera.position.set(10, 8, 15)
    camera.lookAt(3, -2, 1)
    camera.updateMatrixWorld(true)
    gizmo.update(camera, 800, 600, model)
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      const actual = gizmo.group
        .getObjectByName(`scale-handle-${axis}`)!
        .getWorldPosition(new Vector3())
      const expected = new Vector3()
        .setFromMatrixColumn(model, i)
        .multiplyScalar(0.8)
        .add(new Vector3(3, -2, 1))
      expect(actual.distanceTo(expected)).toBeLessThan(1e-12)
    }
    const before = gizmo.group.getObjectByName('scale-handle-z')!.getWorldPosition(new Vector3())
    const enlarged = model.clone().multiply(new Matrix4().makeScale(1, 1, 2))
    gizmo.update(camera, 320, 240, enlarged)
    const after = gizmo.group.getObjectByName('scale-handle-z')!.getWorldPosition(new Vector3())
    expect(
      after
        .clone()
        .sub(new Vector3(3, -2, 1))
        .length(),
    ).toBeCloseTo(
      before
        .clone()
        .sub(new Vector3(3, -2, 1))
        .length() * 2,
      12,
    )
    expect(gizmo.group.position).toEqual(new Vector3(3, -2, 1))
    gizmo.dispose()
  })
  it('follows the preview rotation instead of keeping the original orientation', () => {
    const gizmo = createTransformGizmo()
    const state = draft()
    if (state.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft({ ...state, gesture: { ...state.gesture!, space: 'local' } }, true)
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    gizmo.update(camera, 800, 600, new Matrix4())
    const ring = gizmo.group.getObjectByName('rotation-ring-x') as Mesh
    const before = ring.localToWorld(new Vector3(0, 1, 0))
    const preview = new Matrix4().makeRotationZ(Math.PI / 2)
    gizmo.update(camera, 800, 600, preview)
    const after = ring.localToWorld(new Vector3(0, 1, 0))
    expect(after.distanceTo(before.clone().applyMatrix4(preview))).toBeLessThan(1e-12)
    gizmo.dispose()
  })
  it('keeps the same world geometry across orthographic zoom and viewport resize', () => {
    const gizmo = createTransformGizmo()
    const state = draft()
    if (state.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft(state)
    const camera = new OrthographicCamera(-4, 4, 3, -3, 0.1, 1000)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    gizmo.update(camera, 800, 600)
    const ring = gizmo.group.getObjectByName('rotation-ring-z') as Mesh
    const before = ring.localToWorld(new Vector3(1, 0, 0))
    const projected = before.clone().project(camera).x
    camera.zoom = 2
    camera.updateProjectionMatrix()
    gizmo.update(camera, 320, 240)
    expect(ring.localToWorld(new Vector3(1, 0, 0))).toEqual(before)
    expect(before.clone().project(camera).x).toBeCloseTo(projected * 2, 12)
    gizmo.dispose()
  })

  it('keeps the move controls on the translated object during a drag', () => {
    const gizmo = createTransformGizmo()
    const state = beginTransform(
      selectTarget(createDirectManipulationState(), true),
      'translation',
      cubeVertices,
      [400, 300],
      identity(),
      { pivot: [400, 300], facing: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
    )
    if (state.phase !== 'translation-draft') throw new Error('Expected translation')
    gizmo.setDraft({ ...state, translation: { type: 'translation', x: 2, y: -3, z: 4 } }, true)
    expect(gizmo.group.position).toEqual(new Vector3(2, -3, 4))
    expect(gizmo.group.getObjectByName('move-handle-x')!.renderOrder).toBe(1000)
    gizmo.dispose()
  })
  it('picks only the three visible axis arcs', () => {
    const gizmo = createTransformGizmo()
    const state = draft()
    if (state.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft(state)
    const camera = new OrthographicCamera(-4, 4, 3, -3, 0.1, 1000)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    gizmo.update(camera, 800, 600)
    const rect = { left: 20, top: 30, width: 800, height: 600 } as DOMRect
    const pick = (radius: number) =>
      gizmo.pickControl(camera, rect, 420 + radius * Math.SQRT1_2, 330 - radius * Math.SQRT1_2)
    expect(pick(80)).toBe('z')
    expect(pick(84)).toBe('z')
    expect(pick(91)).toBeNull()
    expect(pick(92)).toBeNull()
    expect(pick(120)).toBeNull()
    gizmo.dispose()
  })
  it('highlights the hovered axis in yellow and makes its ring thicker, then locks that feedback during drag', () => {
    const gizmo = createTransformGizmo()
    const state = draft()
    if (state.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft(state)
    const x = gizmo.group.getObjectByName('rotation-ring-x') as Mesh
    const y = gizmo.group.getObjectByName('rotation-ring-y') as Mesh
    const normalGeometry = x.geometry
    const normalColor = (x.material as MeshBasicMaterial).color.getHex()
    gizmo.setHovered('x')
    expect((x.material as MeshBasicMaterial).color.getHex()).not.toBe(normalColor)
    expect(x.geometry).not.toBe(normalGeometry)
    const highlight = (x.material as MeshBasicMaterial).color.getHex()
    const constrained = setGestureConstraint(state, 'x')
    if (constrained.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft(constrained, true)
    gizmo.setHovered('y')
    expect((x.material as MeshBasicMaterial).color.getHex()).toBe(highlight)
    expect((y.material as MeshBasicMaterial).color.getHex()).not.toBe(highlight)
    expect((y.material as MeshBasicMaterial).opacity).toBeLessThan(0.3)
    gizmo.setDraft(state)
    expect(x.geometry).toBe(normalGeometry)
    expect((x.material as MeshBasicMaterial).color.getHex()).toBe(normalColor)
    gizmo.dispose()
  })
  it('keeps depth-axis scale and move handles separate from the free center in orthographic views', () => {
    const gizmo = createTransformGizmo()
    const camera = new OrthographicCamera(-4, 4, 3, -3, 0.1, 1000)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    for (const kind of ['scale', 'translation'] as const) {
      const state = beginTransform(
        selectTarget(createDirectManipulationState(), true),
        kind,
        cubeVertices,
        [400, 300],
        identity(),
        {
          pivot: [400, 300],
          facing: [0, 0, 1],
          right: [1, 0, 0],
          up: [0, 1, 0],
        },
      )
      if (state.phase === 'idle') throw new Error('Expected draft')
      gizmo.setDraft(state)
      gizmo.update(camera, 800, 600)
      const rect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect
      expect(gizmo.pickControl(camera, rect, 400, 300)).toBe('free')
      expect(gizmo.pickControl(camera, rect, 409, 300)).toBe('z')
    }
    gizmo.dispose()
  })
  it('shows all three colored rotation rings about the pivot and highlights a constrained axis', () => {
    const gizmo = createTransformGizmo()
    const state = draft()
    if (state.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft(state)
    expect(gizmo.group.visible).toBe(true)
    const rings = ['x', 'y', 'z'].map(
      (axis) => gizmo.group.getObjectByName(`rotation-ring-${axis}`) as Mesh,
    )
    expect(
      new Set(rings.map((ring) => (ring.material as MeshBasicMaterial).color.getHex())).size,
    ).toBe(3)
    expect(rings.every((ring) => ring.visible)).toBe(true)
    const constrained = setGestureConstraint(state, 'x')
    if (constrained.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft(constrained, true)
    expect((rings[0]!.material as MeshBasicMaterial).opacity).toBeGreaterThan(
      (rings[1]!.material as MeshBasicMaterial).opacity,
    )
    gizmo.setDraft(null)
    expect(gizmo.group.visible).toBe(false)
    gizmo.dispose()
  })
  it('keeps controls fixed in world units when the camera retreats and releases geometry', () => {
    const gizmo = createTransformGizmo()
    const state = draft()
    if (state.phase === 'idle') throw new Error('Expected draft')
    gizmo.setDraft(state)
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    gizmo.update(camera, 800, 600)
    const scale = gizmo.group.scale.x
    const ringPoint = () =>
      (gizmo.group.getObjectByName('rotation-ring-z') as Mesh).localToWorld(new Vector3(1, 0, 0))
    const worldBefore = ringPoint()
    const screenBefore = worldBefore.clone().project(camera).x
    camera.position.z = 20
    camera.updateMatrixWorld(true)
    gizmo.update(camera, 800, 600)
    expect(gizmo.group.scale.x).toBe(scale)
    expect(gizmo.group.position).toEqual(new Vector3())
    expect(ringPoint()).toEqual(worldBefore)
    expect(ringPoint().project(camera).x).toBeCloseTo(screenBefore / 2, 12)
    const ring = gizmo.group.getObjectByName('rotation-ring-x') as Mesh
    const dispose = vi.spyOn(ring.geometry, 'dispose')
    gizmo.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
