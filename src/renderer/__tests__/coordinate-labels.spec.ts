// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BufferAttribute,
  CanvasTexture,
  Group,
  InstancedMesh,
  PerspectiveCamera,
  Vector3,
} from 'three'
import {
  createCoordinateLabels,
  COORDINATE_LABEL_HEIGHT_PX,
  MAX_LABELS_PER_AXIS,
} from '../coordinate-labels'
import { mockCanvas2D } from './canvas-2d'

beforeEach(() => mockCanvas2D())
afterEach(() => vi.restoreAllMocks())

const cameraAt = (focus = new Vector3()) => {
  const camera = new PerspectiveCamera(45, 4 / 3, 0.0001, 1000)
  camera.position.copy(focus).add(new Vector3(0, 5, 10))
  camera.lookAt(focus)
  camera.updateMatrixWorld()
  return camera
}

describe('world-space coordinate glyph batch', () => {
  it('uses one small atlas, material and instanced draw with a bounded logical pool', () => {
    const labels = createCoordinateLabels()
    expect(labels.group).toBeInstanceOf(Group)
    expect(labels.group.name).toBe('coordinate-labels')
    expect(labels.group.children).toEqual([labels.mesh])
    expect(labels.mesh).toBeInstanceOf(InstancedMesh)
    expect(labels.slots).toHaveLength(3 * MAX_LABELS_PER_AXIS + 1)
    expect(labels.mesh.instanceMatrix.count).toBe(labels.slots.length * 24)
    expect(labels.mesh.material.depthTest || labels.mesh.material.depthWrite).toBe(false)
    expect(labels.mesh.material.opacity).toBe(0.85)
    expect(labels.mesh.renderOrder).toBeGreaterThan(0)
    expect(labels.mesh.material.map).toBe(labels.texture)
    expect(labels.texture).toBeInstanceOf(CanvasTexture)
    const canvas = labels.texture.image as HTMLCanvasElement
    expect([canvas.width, canvas.height]).toEqual([448, 256])
    expect(canvas.parentElement).toBeNull()
    const context = canvas.getContext('2d')!
    expect(context.font).toBe('500 28px system-ui, sans-serif')
    expect(context.textAlign).toBe('center')
    expect(context.textBaseline).toBe('middle')
    expect(context.fillText).toHaveBeenCalledTimes(56)
    labels.dispose()
  })

  it('places unit labels on world axes with the approved offsets and one origin', () => {
    const labels = createCoordinateLabels()
    labels.update(cameraAt(), new Vector3(), 800, 600)
    const x5 = labels.slots.find((slot) => slot.visible && slot.axis === 'x' && slot.value === 5)!
    expect(x5.position.toArray()).toEqual([5, 0.16, 0])
    const camera = cameraAt()
    camera.position.set(4, 4, 4)
    camera.lookAt(0, 0, 0)
    labels.update(camera, new Vector3(), 800, 600)
    for (const axis of ['x', 'y', 'z']) {
      const values = labels.slots.filter((slot) => slot.visible && slot.axis === axis)
      expect(values.some((slot) => slot.value === 1)).toBe(true)
      expect(values.some((slot) => slot.value === 2)).toBe(true)
    }
    const origins = labels.slots.filter((slot) => slot.visible && slot.value === 0)
    expect(origins).toHaveLength(1)
    expect(origins[0]!.position.toArray()).toEqual([-0.16, 0.16, 0])
    labels.dispose()
  })

  it('retains slots for surviving axis values when one candidate enters', () => {
    const labels = createCoordinateLabels()
    const focus = new Vector3()
    const camera = cameraAt()
    labels.update(camera, focus, 800, 600)
    const existing = labels.slots
      .filter((slot) => slot.visible && slot.axis === 'x')
      .map((slot) => ({ slot, value: slot.value, position: slot.position.clone() }))
    const mesh = labels.mesh
    const material = mesh.material
    const texture = labels.texture
    const canvas = texture.image
    const version = texture.version
    focus.x = 1
    camera.position.x = 1
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600)
    const desired = labels.slots.filter((slot) => slot.visible && slot.axis === 'x')
    expect(
      desired.filter((slot) => !existing.some((old) => old.value === slot.value)),
    ).toHaveLength(1)
    for (const old of existing) {
      const retained = desired.find((slot) => slot.value === old.value)
      if (!retained) continue
      expect(retained).toBe(old.slot)
      expect(retained.position).toEqual(old.position)
    }
    expect(labels.mesh).toBe(mesh)
    expect(labels.mesh.material).toBe(material)
    expect(labels.texture).toBe(texture)
    expect(labels.texture.image).toBe(canvas)
    expect(texture.version).toBe(version)
    labels.dispose()
  })

  it('creates no graphical resources and never redraws the atlas during navigation', () => {
    const labels = createCoordinateLabels()
    const slots = [...labels.slots]
    const mesh = labels.mesh
    const material = mesh.material
    const geometry = mesh.geometry
    const texture = labels.texture
    const canvas = texture.image as HTMLCanvasElement
    const context = canvas.getContext('2d')!
    const drawCount = vi.mocked(context.fillText).mock.calls.length
    const textureVersion = texture.version
    const createElement = vi.spyOn(document, 'createElement')
    const camera = cameraAt()
    const focus = new Vector3()
    for (let i = 0; i < 100; i++) {
      focus.set([0, 100, 1000, 10000, 1e6, -1e6, 1e9][i % 7]!, 0, 0)
      camera.position.copy(focus).addScalar(5 + i * 0.001)
      camera.lookAt(focus)
      labels.update(camera, focus, 800, 600)
      expect(labels.mesh.count).toBeLessThanOrEqual(slots.length * 24)
    }
    expect(createElement).not.toHaveBeenCalled()
    expect(labels.slots).toEqual(slots)
    expect(labels.mesh).toBe(mesh)
    expect(mesh.material).toBe(material)
    expect(mesh.geometry).toBe(geometry)
    expect(labels.texture).toBe(texture)
    expect(texture.image).toBe(canvas)
    expect(texture.version).toBe(textureVersion)
    expect(context.fillText).toHaveBeenCalledTimes(drawCount)
    expect(context.clearRect).not.toHaveBeenCalled()
    labels.dispose()
  })

  it('keeps instance buffers and world anchors unchanged for unchanged candidates', () => {
    const labels = createCoordinateLabels()
    const camera = cameraAt()
    const focus = new Vector3()
    labels.update(camera, focus, 800, 600)
    const versions = [
      labels.mesh.instanceMatrix.version,
      (labels.mesh.geometry.getAttribute('glyph') as BufferAttribute).version,
    ]
    const x5 = labels.slots.find((slot) => slot.axis === 'x' && slot.value === 5)!
    const position = x5.position.clone()
    camera.position.x += 0.00001
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600)
    expect(x5.position).toEqual(position)
    expect([
      labels.mesh.instanceMatrix.version,
      (labels.mesh.geometry.getAttribute('glyph') as BufferAttribute).version,
    ]).toEqual(versions)
    labels.dispose()
  })

  it('preserves stride when camera and focus translate far from the origin', () => {
    const strideAt = (x: number) => {
      const labels = createCoordinateLabels()
      const focus = new Vector3(x, 0, 0)
      const camera = cameraAt(focus)
      camera.position.copy(focus).addScalar(5)
      camera.lookAt(focus)
      labels.update(camera, focus, 800, 600)
      const values = labels.slots
        .filter((slot) => slot.visible && slot.axis === 'x')
        .map((slot) => slot.value!)
        .sort((a, b) => a - b)
      expect(values.length).toBeGreaterThan(2)
      // GPU translations remain small even when the world coordinate is large.
      expect(Math.abs(labels.mesh.instanceMatrix.array[12]!)).toBeLessThan(20)
      labels.dispose()
      return values[values.length - 1]! - values[values.length - 2]!
    }
    expect(strideAt(1e9)).toBe(strideAt(0))
  })

  it('reduces label density at distance and supports the current scientific formatting', () => {
    const labels = createCoordinateLabels()
    const camera = cameraAt()
    camera.position.multiplyScalar(1e22)
    camera.far = 1e25
    camera.updateProjectionMatrix()
    camera.lookAt(0, 0, 0)
    labels.update(camera, new Vector3(), 800, 600)
    const visible = labels.slots.filter((slot) => slot.visible)
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.filter((slot) => slot.axis === 'x').length).toBeLessThanOrEqual(
      MAX_LABELS_PER_AXIS,
    )
    expect(visible.some((slot) => slot.text.includes('e'))).toBe(true)
    expect(labels.mesh.count).toBe(visible.reduce((sum, slot) => sum + slot.text.length, 0))
    const glyph = labels.mesh.geometry.getAttribute('glyph')
    for (let i = 0; i < labels.mesh.count; i++) {
      expect(glyph.getX(i)).toBeGreaterThanOrEqual(0)
      expect(glyph.getX(i)).toBeLessThan(14)
    }
    labels.dispose()
  })

  it('disposes the shared resources exactly once, including instance buffers', () => {
    const labels = createCoordinateLabels()
    const dispose = [labels.mesh, labels.mesh.geometry, labels.mesh.material, labels.texture].map(
      (resource) => vi.spyOn(resource, 'dispose'),
    )
    labels.dispose()
    labels.dispose()
    for (const spy of dispose) expect(spy).toHaveBeenCalledOnce()
    expect(labels.group.children).toHaveLength(0)
  })

  it('bakes shadow on canvas context and maintains constant ~15px screen-space label height via clip-space projection', () => {
    expect(COORDINATE_LABEL_HEIGHT_PX).toBe(15)

    const labels = createCoordinateLabels()
    const canvas = labels.texture.image as HTMLCanvasElement
    const context = canvas.getContext('2d')!
    expect(context.shadowColor).toBeTruthy()
    expect(context.shadowBlur).toBeGreaterThan(0)

    const camera = cameraAt()
    labels.update(camera, new Vector3(), 1024, 768)

    const uniforms = (
      labels.mesh.material as unknown as {
        userData?: { uniforms?: { uViewportSize?: { value?: { x: number; y: number } } } }
      }
    ).userData?.uniforms
    expect(uniforms?.uViewportSize?.value?.x).toBe(1024)
    expect(uniforms?.uViewportSize?.value?.y).toBe(768)

    labels.dispose()
  })

  it('keeps X and Z labels anchored to zero-lines Z=0 and X=0 during in-plane pan in XZ view (RED 16)', () => {
    const labels = createCoordinateLabels()
    const focus = new Vector3(0, 0, 0)
    const camera = cameraAt(focus)
    labels.update(camera, focus, 800, 600, 'xz')

    // Initial check: visible X labels have z === 0, Z labels have x === 0
    const xInit = labels.slots.filter((s) => s.visible && s.axis === 'x')
    const zInit = labels.slots.filter((s) => s.visible && s.axis === 'z')
    expect(xInit.length).toBeGreaterThan(0)
    expect(zInit.length).toBeGreaterThan(0)

    // Pan camera and focus in-plane (e.g. delta [3, 0, 4])
    camera.position.add(new Vector3(3, 0, 4))
    focus.add(new Vector3(3, 0, 4))
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600, 'xz')

    const xPan = labels.slots.filter((s) => s.visible && s.axis === 'x')
    const zPan = labels.slots.filter((s) => s.visible && s.axis === 'z')
    expect(xPan.length).toBeGreaterThan(0)
    expect(zPan.length).toBeGreaterThan(0)

    for (const slot of xPan) {
      expect(slot.position.z).toBe(0)
    }
    for (const slot of zPan) {
      expect(slot.position.x).toBe(0)
    }

    labels.dispose()
  })

  it('keeps Y and Z labels anchored to zero-lines Z=0 and Y=0 during in-plane pan in YZ view (RED 17)', () => {
    const labels = createCoordinateLabels()
    const focus = new Vector3(2, 0, 0)
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000)
    camera.position.set(32, 0, 0)
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600, 'yz')

    // Pan in YZ plane: delta [0, 5, -7]
    camera.position.add(new Vector3(0, 5, -7))
    focus.add(new Vector3(0, 5, -7))
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600, 'yz')

    const yPan = labels.slots.filter((s) => s.visible && s.axis === 'y')
    const zPan = labels.slots.filter((s) => s.visible && s.axis === 'z')
    expect(yPan.length).toBeGreaterThan(0)
    expect(zPan.length).toBeGreaterThan(0)

    for (const slot of yPan) {
      expect(slot.position.x).toBe(0)
      expect(slot.position.z).toBeCloseTo(0.16)
    }
    for (const slot of zPan) {
      expect(slot.position.x).toBe(0)
      expect(slot.position.y).toBeCloseTo(0.16)
    }

    labels.dispose()
  })

  it('keeps X and Y labels anchored to zero-lines Y=0 and X=0 during in-plane pan in XY view (RED 18)', () => {
    const labels = createCoordinateLabels()
    const focus = new Vector3(0, 0, -3)
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 1000)
    camera.position.set(0, 0, 27)
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600, 'xy')

    // Pan in XY plane: delta [8, -6, 0]
    camera.position.add(new Vector3(8, -6, 0))
    focus.add(new Vector3(8, -6, 0))
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600, 'xy')

    const xPan = labels.slots.filter((s) => s.visible && s.axis === 'x')
    const yPan = labels.slots.filter((s) => s.visible && s.axis === 'y')
    expect(xPan.length).toBeGreaterThan(0)
    expect(yPan.length).toBeGreaterThan(0)

    for (const slot of xPan) {
      expect(slot.position.y).toBeCloseTo(0.16)
      expect(slot.position.z).toBe(0)
    }
    for (const slot of yPan) {
      expect(slot.position.x).toBeCloseTo(0.16)
      expect(slot.position.z).toBe(0)
    }

    labels.dispose()
  })

  it('keeps labels anchored to world axes Y=0 during vertical camera pan in XZ view (RED 28)', () => {
    const labels = createCoordinateLabels()
    const focus = new Vector3(0, 0, 0)
    const camera = cameraAt(focus)
    labels.update(camera, focus, 800, 600, 'xz')

    // Pan camera navigation target to Y = 5
    focus.set(0, 5, 0)
    camera.position.set(0, 10, 10)
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600, 'xz')

    const xLabels = labels.slots.filter((s) => s.visible && s.axis === 'x')
    const zLabels = labels.slots.filter((s) => s.visible && s.axis === 'z')
    expect(xLabels.length).toBeGreaterThan(0)
    expect(zLabels.length).toBeGreaterThan(0)

    for (const slot of xLabels) {
      expect(slot.position.y).toBeCloseTo(0.16)
      expect(slot.position.z).toBe(0)
    }
    for (const slot of zLabels) {
      expect(slot.position.y).toBeCloseTo(0.16)
      expect(slot.position.x).toBe(0)
    }

    labels.dispose()
  })

  it('keeps label world positions invariant on pan even when candidate value is retained (RED 28)', () => {
    const labels = createCoordinateLabels()
    const focus = new Vector3(0, 0, 0)
    const camera = cameraAt(focus)
    labels.update(camera, focus, 800, 600, 'xz')

    const x1 = labels.slots.find((s) => s.visible && s.axis === 'x' && s.value === 1)!
    expect(x1).toBeDefined()
    expect(x1.position.y).toBeCloseTo(0.16)

    // Pan camera vertically to Y = 5; label position on X axis must stay at Y = 0.16
    focus.set(0, 5, 0)
    camera.position.set(0, 10, 10)
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600, 'xz')

    expect(x1.value).toBe(1)
    expect(x1.position.y).toBeCloseTo(0.16)

    labels.dispose()
  })

  it('hides axis labels when panning so far that the axis zero-line leaves the frustum, and restores them on pan back (RED 21, 22)', () => {
    const labels = createCoordinateLabels()
    const focus = new Vector3(0, 0, 0)
    const camera = cameraAt(focus)
    labels.update(camera, focus, 800, 600, 'xz')

    expect(labels.slots.filter((s) => s.visible && s.axis === 'x').length).toBeGreaterThan(0)

    // Pan camera and focus in Z by 100 units so the X axis (Z=0) is far outside the camera frustum
    camera.position.z += 100
    focus.z += 100
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600, 'xz')

    // X labels must not be generated around focus when X axis is off screen
    expect(labels.slots.filter((s) => s.visible && s.axis === 'x')).toHaveLength(0)

    // Pan back to origin
    camera.position.z -= 100
    focus.z -= 100
    camera.lookAt(focus)
    labels.update(camera, focus, 800, 600, 'xz')

    const restoredX = labels.slots.filter((s) => s.visible && s.axis === 'x')
    expect(restoredX.length).toBeGreaterThan(0)
    for (const slot of restoredX) {
      expect(slot.position.z).toBe(0)
    }

    labels.dispose()
  })
})
