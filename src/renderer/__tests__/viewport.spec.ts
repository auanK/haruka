// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Camera,
  Group,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { transformCubeVertices, type CubeVertex } from '../../app/didactic-cube'
import { composeTransforms, multiply, toMatrix, transformPoint } from '../../domain'
import { mockCanvas2D } from './canvas-2d'
import {
  MAX_WEBGL_DPR,
  mountHarukaViewport,
  renderViewport,
  resizeViewport,
  type HarukaViewport,
} from '../viewport'
import * as orientationGizmo from '../orientation-gizmo'

let notifyResize: () => void
let devicePixelRatioDescriptor: PropertyDescriptor

beforeEach(() => {
  devicePixelRatioDescriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')!
  mockCanvas2D()
  vi.useFakeTimers()
  global.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      notifyResize = () => callback([], this as unknown as ResizeObserver)
    }
    observe = vi.fn<(target: Element) => void>()
    unobserve = vi.fn<(target: Element) => void>()
    disconnect = vi.fn<() => void>()
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', devicePixelRatioDescriptor)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('resizeViewport', () => {
  it('updates renderer size, camera aspect and projection for rectangular and square containers', () => {
    const renderer = { setDrawingBufferSize: vi.fn<WebGLRenderer['setDrawingBufferSize']>() }
    const camera = new PerspectiveCamera(45, 1, 0.1, 100)

    resizeViewport(renderer, camera, 1600, 800)

    expect(camera.aspect).toBe(2)
    expect(camera.projectionMatrix).toEqual(new PerspectiveCamera(45, 2, 0.1, 100).projectionMatrix)
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(1600, 800, 1)

    resizeViewport(renderer, camera, 800, 800)

    expect(camera.aspect).toBe(1)
    expect(camera.projectionMatrix).toEqual(new PerspectiveCamera(45, 1, 0.1, 100).projectionMatrix)
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(800, 800, 1)
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(2)
  })

  it.each([
    [1600, 0],
    [0, 800],
    [-1, 800],
    [1600, -1],
  ])('ignores invalid container dimensions %i × %i', (width, height) => {
    const renderer = { setDrawingBufferSize: vi.fn<WebGLRenderer['setDrawingBufferSize']>() }
    const camera = new PerspectiveCamera(45, 2, 0.1, 100)
    const projection = camera.projectionMatrix.clone()

    resizeViewport(renderer, camera, width, height)

    expect(camera.aspect).toBe(2)
    expect(camera.projectionMatrix).toEqual(projection)
    expect(renderer.setDrawingBufferSize).not.toHaveBeenCalled()
  })
})

describe('renderViewport', () => {
  it.each([
    [800, 600, 96, 692, 492],
    [180, 120, 96, 72, 12],
    [60, 50, 26, 22, 12],
  ])(
    'renders the camera-oriented overlay at the current top-right corner of %i × %i',
    (width, height, size, x, y) => {
      const graph = {
        scene: new Scene(),
        camera: new PerspectiveCamera(),
        updateScene: vi.fn<(width: number, height: number, focus?: Vector3) => void>(),
      }
      const gizmo = {
        scene: new Scene(),
        camera: new OrthographicCamera(),
        group: new Group(),
        updateOrientation: vi.fn<(camera: Camera) => void>(),
        dispose: vi.fn<() => void>(),
      }
      const events: string[] = []
      const renderer = {
        autoClear: true,
        setViewport: vi.fn<WebGLRenderer['setViewport']>(),
        setScissor: vi.fn<WebGLRenderer['setScissor']>(),
        setScissorTest: vi.fn<WebGLRenderer['setScissorTest']>(),
        clearDepth: vi.fn<WebGLRenderer['clearDepth']>(() => {
          events.push('clear depth')
        }),
        render: vi.fn<WebGLRenderer['render']>((scene) => {
          events.push(`${scene === graph.scene ? 'main' : 'gizmo'} autoClear=${renderer.autoClear}`)
        }),
      }

      renderViewport(renderer, graph, gizmo, width, height)

      expect(events).toEqual(['main autoClear=true', 'clear depth', 'gizmo autoClear=false'])
      expect(renderer.render.mock.calls).toEqual([
        [graph.scene, graph.camera],
        [gizmo.scene, gizmo.camera],
      ])
      expect(graph.updateScene).toHaveBeenCalledWith(width, height, undefined)
      expect(gizmo.updateOrientation).toHaveBeenCalledExactlyOnceWith(graph.camera)
      expect(renderer.setViewport.mock.calls).toEqual([
        [0, 0, width, height],
        [x, y, size, size],
        [0, 0, width, height],
      ])
      expect(renderer.setScissor.mock.calls).toEqual([
        [x, y, size, size],
        [0, 0, width, height],
      ])
      expect(renderer.setScissorTest.mock.calls).toEqual([[false], [true], [false]])
      expect(renderer.autoClear).toBe(true)
    },
  )

  it('skips the gizmo overlay for a viewport too small to leave its margins', () => {
    const graph = {
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      updateScene: vi.fn<(width: number, height: number, focus?: Vector3) => void>(),
    }
    const gizmo = {
      scene: new Scene(),
      camera: new OrthographicCamera(),
      group: new Group(),
      updateOrientation: vi.fn<(camera: Camera) => void>(),
      dispose: vi.fn<() => void>(),
    }
    const renderer = {
      autoClear: true,
      setViewport: vi.fn<WebGLRenderer['setViewport']>(),
      setScissor: vi.fn<WebGLRenderer['setScissor']>(),
      setScissorTest: vi.fn<WebGLRenderer['setScissorTest']>(),
      clearDepth: vi.fn<WebGLRenderer['clearDepth']>(),
      render: vi.fn<WebGLRenderer['render']>(),
    }

    renderViewport(renderer, graph, gizmo, 20, 20)

    expect(renderer.render).toHaveBeenCalledExactlyOnceWith(graph.scene, graph.camera)
    expect(renderer.clearDepth).not.toHaveBeenCalled()
    expect(gizmo.updateOrientation).not.toHaveBeenCalled()
    expect(renderer.autoClear).toBe(true)
  })
})

describe('render-on-demand lifecycle and invalidation', () => {
  it('renders object-only changes without updating camera-dependent annotations', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    const gizmo = orientationGizmo.createOrientationGizmo()
    vi.spyOn(orientationGizmo, 'createOrientationGizmo').mockReturnValue(gizmo)
    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()
    const grid = vi.spyOn(viewport.grid, 'update')
    const labels = vi.spyOn(viewport.coordinateLabels, 'update')
    const orientation = vi.spyOn(gizmo, 'updateOrientation')
    const render = vi.spyOn(viewport.renderer, 'render')
    const matrix = toMatrix({ type: 'translation', x: 5, y: 0, z: 0 })
    viewport.sync({ matrix, vertices: transformCubeVertices(matrix) })
    vi.runAllTimers()
    expect(grid).not.toHaveBeenCalled()
    expect(labels).not.toHaveBeenCalled()
    expect(orientation).not.toHaveBeenCalled()
    expect(render.mock.calls.filter(([scene]) => scene === viewport.scene)).toHaveLength(1)
    viewport.dispose()
  })

  it('unions camera, object and resize invalidation in one RAF and clears camera dirtiness', () => {
    const container = document.createElement('div')
    let width = 800
    Object.defineProperty(container, 'clientWidth', { get: () => width })
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    const gizmo = orientationGizmo.createOrientationGizmo()
    vi.spyOn(orientationGizmo, 'createOrientationGizmo').mockReturnValue(gizmo)
    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()
    const grid = vi.spyOn(viewport.grid, 'update')
    const labels = vi.spyOn(viewport.coordinateLabels, 'update')
    const orientation = vi.spyOn(gizmo, 'updateOrientation')
    const render = vi.spyOn(viewport.renderer, 'render')
    const drawingBuffer = vi.spyOn(viewport.renderer, 'setDrawingBufferSize')
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const matrix = toMatrix({ type: 'translation', x: 5, y: 0, z: 0 })
    viewport.controls.dispatchEvent({ type: 'change' })
    viewport.sync({ matrix, vertices: transformCubeVertices(matrix) })
    width = 900
    notifyResize()
    expect(raf).toHaveBeenCalledOnce()
    expect(drawingBuffer).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(drawingBuffer).toHaveBeenCalledExactlyOnceWith(900, 600, expect.any(Number))
    expect(grid).toHaveBeenCalledOnce()
    expect(labels).toHaveBeenCalledOnce()
    expect(orientation).toHaveBeenCalledOnce()
    expect(render.mock.calls.filter(([scene]) => scene === viewport.scene)).toHaveLength(1)
    grid.mockClear()
    labels.mockClear()
    orientation.mockClear()
    drawingBuffer.mockClear()
    viewport.sync({ matrix, vertices: transformCubeVertices(matrix) })
    vi.runAllTimers()
    expect(drawingBuffer).not.toHaveBeenCalled()
    expect(grid).not.toHaveBeenCalled()
    expect(labels).not.toHaveBeenCalled()
    expect(orientation).not.toHaveBeenCalled()
    viewport.dispose()
  })

  it('defers drawing buffer resize to the scheduled RAF instead of resizing synchronously on observer callback', () => {
    const container = document.createElement('div')
    let width = 800
    Object.defineProperty(container, 'clientWidth', { get: () => width })
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()

    const drawingBuffer = vi.spyOn(viewport.renderer, 'setDrawingBufferSize')
    const render = vi.spyOn(viewport.renderer, 'render')

    width = 950
    notifyResize()

    expect(drawingBuffer).not.toHaveBeenCalledWith(950, 600, expect.any(Number))

    vi.runAllTimers()

    expect(drawingBuffer).toHaveBeenCalledWith(950, 600, expect.any(Number))
    expect(render).toHaveBeenCalled()

    viewport.dispose()
  })

  it('coalesces multiple rapid resize notifications so only the latest size is applied in a single RAF', () => {
    const container = document.createElement('div')
    let width = 800
    Object.defineProperty(container, 'clientWidth', { get: () => width })
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()

    const drawingBuffer = vi.spyOn(viewport.renderer, 'setDrawingBufferSize')
    const render = vi.spyOn(viewport.renderer, 'render')
    const raf = vi.spyOn(window, 'requestAnimationFrame')

    width = 810
    notifyResize()
    width = 820
    notifyResize()
    width = 830
    notifyResize()

    expect(raf).toHaveBeenCalledOnce()
    expect(drawingBuffer).not.toHaveBeenCalled()

    vi.runAllTimers()

    expect(drawingBuffer).toHaveBeenCalledExactlyOnceWith(830, 600, expect.any(Number))
    expect(render.mock.calls.filter(([scene]) => scene === viewport.scene)).toHaveLength(1)

    viewport.dispose()
  })

  it('updates annotations exactly once for a camera-only frame', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    const gizmo = orientationGizmo.createOrientationGizmo()
    vi.spyOn(orientationGizmo, 'createOrientationGizmo').mockReturnValue(gizmo)
    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()
    const grid = vi.spyOn(viewport.grid, 'update')
    const labels = vi.spyOn(viewport.coordinateLabels, 'update')
    const orientation = vi.spyOn(gizmo, 'updateOrientation')
    const render = vi.spyOn(viewport.renderer, 'render')
    viewport.controls.dispatchEvent({ type: 'change' })
    vi.runAllTimers()
    expect(grid).toHaveBeenCalledOnce()
    expect(labels).toHaveBeenCalledOnce()
    expect(orientation).toHaveBeenCalledOnce()
    expect(render.mock.calls.filter(([scene]) => scene === viewport.scene)).toHaveLength(1)
    viewport.dispose()
  })

  it('ignores repeated 800 × 600 DPR 1.5 resize callbacks completely', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')!
    Object.defineProperty(window, 'devicePixelRatio', { value: 1.5, configurable: true })
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()
    expect(viewport.renderer.getPixelRatio()).toBe(1.5)
    const drawingBuffer = vi.spyOn(viewport.renderer, 'setDrawingBufferSize')
    const pixelRatio = vi.spyOn(viewport.renderer, 'setPixelRatio')
    const size = vi.spyOn(viewport.renderer, 'setSize')
    const projection = vi.spyOn(viewport.camera, 'updateProjectionMatrix')
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    notifyResize()
    notifyResize()
    expect(drawingBuffer).not.toHaveBeenCalled()
    expect(pixelRatio).not.toHaveBeenCalled()
    expect(size).not.toHaveBeenCalled()
    expect(projection).not.toHaveBeenCalled()
    expect(raf).not.toHaveBeenCalled()
    expect([viewport.renderer.domElement.width, viewport.renderer.domElement.height]).toEqual([
      1200, 900,
    ])
    viewport.dispose()
    Object.defineProperty(window, 'devicePixelRatio', descriptor)
  })

  it('updates the buffer and annotations for DPR-only resize without changing projection', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    const gizmo = orientationGizmo.createOrientationGizmo()
    vi.spyOn(orientationGizmo, 'createOrientationGizmo').mockReturnValue(gizmo)
    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()
    const grid = vi.spyOn(viewport.grid, 'update')
    const labels = vi.spyOn(viewport.coordinateLabels, 'update')
    const orientation = vi.spyOn(gizmo, 'updateOrientation')
    const render = vi.spyOn(viewport.renderer, 'render')
    const buffer = vi.spyOn(viewport.renderer, 'setDrawingBufferSize')
    const projection = vi.spyOn(viewport.camera, 'updateProjectionMatrix')
    Object.defineProperty(window, 'devicePixelRatio', { value: 1.5, configurable: true })
    notifyResize()
    vi.runAllTimers()
    expect(buffer).toHaveBeenCalledExactlyOnceWith(800, 600, 1.5)
    expect(projection).not.toHaveBeenCalled()
    expect(grid).toHaveBeenCalledOnce()
    expect(labels).toHaveBeenCalledOnce()
    expect(orientation).toHaveBeenCalledOnce()
    expect(render.mock.calls.filter(([scene]) => scene === viewport.scene)).toHaveLength(1)
    viewport.dispose()
  })

  it('caps effective WebGL device pixel ratio at MAX_WEBGL_DPR = 1.5', () => {
    expect(MAX_WEBGL_DPR).toBe(1.5)
  })

  it('coalesces multiple requests into one frame and remains idle afterwards', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    const viewport = mountHarukaViewport(container)

    // Mount requested initial frame
    expect(rafSpy).toHaveBeenCalledTimes(1)

    // Trigger multiple invalidations before frame fires
    viewport.requestRender()
    viewport.requestRender()
    viewport.requestRender()

    // Still coalesced into 1 pending RAF
    expect(rafSpy).toHaveBeenCalledTimes(1)

    // Execute the frame
    vi.runAllTimers()

    // Frame executed, now in idle: no perpetual RAF loop
    const rafCallsAfterFrame = rafSpy.mock.calls.length
    vi.advanceTimersByTime(5000)
    expect(rafSpy.mock.calls.length).toBe(rafCallsAfterFrame)

    viewport.dispose()
  })

  it('schedules a frame on controls change event', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const viewport = mountHarukaViewport(container)
    vi.runAllTimers() // drain initial mount frame

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')

    // Simulate user interaction with OrbitControls
    viewport.controls.dispatchEvent({ type: 'change' })

    expect(rafSpy).toHaveBeenCalledTimes(1)

    viewport.dispose()
  })

  it('schedules a frame when sync is called with new state', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const viewport = mountHarukaViewport(container)
    vi.runAllTimers() // drain initial mount frame

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')

    const matrix = toMatrix({ type: 'translation', x: 5, y: 0, z: 0 })
    const vertices: CubeVertex[] = [
      { id: 'V1', point: [4.5, -0.5, -0.5] },
      { id: 'V2', point: [5.5, -0.5, -0.5] },
      { id: 'V3', point: [5.5, 0.5, -0.5] },
      { id: 'V4', point: [4.5, 0.5, -0.5] },
      { id: 'V5', point: [4.5, -0.5, 0.5] },
      { id: 'V6', point: [5.5, -0.5, 0.5] },
      { id: 'V7', point: [5.5, 0.5, 0.5] },
      { id: 'V8', point: [4.5, 0.5, 0.5] },
    ]

    viewport.sync({ matrix, vertices })

    expect(rafSpy).toHaveBeenCalledTimes(1)
    expect(viewport.target.matrix.elements[12]).toBe(5)

    viewport.dispose()
  })

  it('cancels pending RAF and removes controls listener on dispose', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')
    const viewport = mountHarukaViewport(container)

    // A RAF is pending from mount
    viewport.dispose()

    expect(cancelSpy).toHaveBeenCalled()

    // Subsequent events do not trigger rendering
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    viewport.requestRender()
    viewport.controls.dispatchEvent({ type: 'change' })
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('ensures camera has orbit, pan, and zoom enabled always without follow mode', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()

    expect(viewport.controls.enableRotate).toBe(true)
    expect(viewport.controls.enablePan).toBe(true)
    expect(viewport.controls.enableZoom).toBe(true)
    expect(viewport.controls.enableDamping).toBe(false)
    expect(viewport.controls.minDistance).toBe(0)
    expect(viewport.controls.maxDistance).toBe(Infinity)

    viewport.dispose()
  })

  it('guarantees cube transformation never automatically moves camera or controls.target', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()

    const initialCamPos = viewport.camera.position.clone()
    const initialTarget = viewport.controls.target.clone()

    // 1. First transform (translation x = 15)
    const matrix1 = toMatrix({ type: 'translation', x: 15, y: 0, z: 0 })
    const vertices1: CubeVertex[] = [
      { id: 'V1', point: [14.5, -0.5, -0.5] },
      { id: 'V2', point: [15.5, -0.5, -0.5] },
      { id: 'V3', point: [15.5, 0.5, -0.5] },
      { id: 'V4', point: [14.5, 0.5, -0.5] },
      { id: 'V5', point: [14.5, -0.5, 0.5] },
      { id: 'V6', point: [15.5, -0.5, 0.5] },
      { id: 'V7', point: [15.5, 0.5, 0.5] },
      { id: 'V8', point: [14.5, 0.5, 0.5] },
    ]
    viewport.sync({ matrix: matrix1, vertices: vertices1 })

    // Camera and controls.target must be completely untouched
    expect(viewport.camera.position.toArray()).toEqual(initialCamPos.toArray())
    expect(viewport.controls.target.toArray()).toEqual(initialTarget.toArray())

    viewport.dispose()
  })

  it('locates the transformed cube on demand, and subsequent transforms do not drag camera', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()

    const matrix1 = toMatrix({ type: 'translation', x: 20, y: 5, z: 10 })
    const vertices1: CubeVertex[] = [
      { id: 'V1', point: [19.5, 4.5, 9.5] },
      { id: 'V2', point: [20.5, 4.5, 9.5] },
      { id: 'V3', point: [20.5, 5.5, 9.5] },
      { id: 'V4', point: [19.5, 5.5, 9.5] },
      { id: 'V5', point: [19.5, 4.5, 10.5] },
      { id: 'V6', point: [20.5, 4.5, 10.5] },
      { id: 'V7', point: [20.5, 5.5, 10.5] },
      { id: 'V8', point: [19.5, 5.5, 10.5] },
    ]
    viewport.sync({ matrix: matrix1, vertices: vertices1 })

    // Move camera to an arbitrary distant location
    viewport.camera.position.set(-100, 50, -200)
    viewport.controls.target.set(-100, 0, -200)
    viewport.controls.update()

    // Trigger locateCube
    viewport.locateCube()

    // controls.target must now be centered on the transformed cube centroid (20, 5, 10)
    expect(viewport.controls.target.x).toBeCloseTo(20)
    expect(viewport.controls.target.y).toBeCloseTo(5)
    expect(viewport.controls.target.z).toBeCloseTo(10)

    // Camera is positioned along a deterministic diagonal from the center
    const camDirection = new Vector3()
      .subVectors(viewport.camera.position, viewport.controls.target)
      .normalize()
    const expectedDirection = new Vector3(1, 1, 1).normalize()
    expect(camDirection.x).toBeCloseTo(expectedDirection.x, 3)
    expect(camDirection.y).toBeCloseTo(expectedDirection.y, 3)
    expect(camDirection.z).toBeCloseTo(expectedDirection.z, 3)

    // Post-locate transform: another translation must NOT move camera or target
    const locatedCamPos = viewport.camera.position.clone()
    const locatedTarget = viewport.controls.target.clone()

    const matrix2 = toMatrix({ type: 'translation', x: 50, y: 0, z: 0 })
    viewport.sync({ matrix: matrix2, vertices: [] })

    expect(viewport.camera.position.toArray()).toEqual(locatedCamPos.toArray())
    expect(viewport.controls.target.toArray()).toEqual(locatedTarget.toArray())

    viewport.dispose()
  })

  it('preserves resource stability across repeated render updates without churn', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const viewport = mountHarukaViewport(container)
    const labelGroup = viewport.scene.getObjectByName('coordinate-labels')
    expect(labelGroup).toBeInstanceOf(Group)
    const gridMesh = viewport.grid.group.children.find((child) => child instanceof Mesh) as Mesh
    const gridGeom = gridMesh.geometry
    const gridMat = gridMesh.material

    for (let i = 0; i < 20; i++) {
      viewport.camera.position.set(10 + i, 10 + i, 10 + i)
      viewport.requestRender()
      vi.runAllTimers()
    }

    expect(viewport.scene.getObjectByName('coordinate-labels')).toBe(labelGroup)
    expect(gridMesh.geometry).toBe(gridGeom)
    expect(gridMesh.material).toBe(gridMat)

    viewport.dispose()
  })

  it('supports mount -> dispose -> mount -> dispose without residual listeners or canvases', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })

    const vp1 = mountHarukaViewport(container)
    expect(container.querySelectorAll('canvas')).toHaveLength(1) // Only the WebGL canvas belongs to the viewport
    vp1.dispose()
    expect(container.querySelectorAll('canvas')).toHaveLength(0)

    const vp2 = mountHarukaViewport(container)
    expect(container.querySelectorAll('canvas')).toHaveLength(1)
    vp2.dispose()
    expect(container.querySelectorAll('canvas')).toHaveLength(0)
  })
})

describe('free navigation and adaptive clipping', () => {
  const mount = () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    const viewport = mountHarukaViewport(container)
    vi.runAllTimers()
    return viewport
  }

  it('keeps zero/Infinity bounds through Locate, Translation and extreme Scale', () => {
    const viewport = mount()
    const expectFree = () => {
      expect(viewport.controls.minDistance).toBe(0)
      expect(viewport.controls.maxDistance).toBe(Infinity)
    }
    expectFree()
    viewport.locateCube()
    expectFree()
    for (const transform of [
      { type: 'translation', x: 1000, y: 5, z: 0 },
      { type: 'scale', x: 100, y: 100, z: 100 },
      { type: 'scale', x: 0.001, y: 0.001, z: 0.001 },
    ] as const) {
      const position = viewport.camera.position.clone()
      const target = viewport.controls.target.clone()
      const projectionUpdate = vi.spyOn(viewport.camera, 'updateProjectionMatrix')
      const matrix = toMatrix(transform)
      viewport.sync({ matrix, vertices: transformCubeVertices(matrix) })
      expectFree()
      expect(viewport.camera.position).toEqual(position)
      expect(viewport.controls.target).toEqual(target)
      expect(projectionUpdate).not.toHaveBeenCalled()
      vi.runAllTimers()
      expect(viewport.camera.position).toEqual(position)
      expect(viewport.controls.target).toEqual(target)
      projectionUpdate.mockRestore()
    }
    viewport.dispose()
  })

  it.each([100, 1000, 10000, 1000000])(
    'accepts distance %i without clamping and grows clipping',
    (distance) => {
      const viewport = mount()
      viewport.camera.position.set(distance, 0, 0)
      viewport.controls.target.set(0, 0, 0)
      viewport.controls.update()
      vi.runAllTimers()
      expect(viewport.camera.position.distanceTo(viewport.controls.target)).toBeCloseTo(distance)
      expect(viewport.camera.far).toBeGreaterThan(distance)
      expect(viewport.camera.near).toBeGreaterThan(0)
      expect(Number.isFinite(viewport.camera.far)).toBe(true)
      viewport.dispose()
    },
  )

  it('keeps GPU texture and geometry counts stable from the first frame through navigation', () => {
    const viewport = mount()
    const initial = { ...viewport.renderer.info.memory }
    // The mock has no shader map uniforms; it counts explicitly initialized pool textures.
    expect(initial.textures).toBe(viewport.coordinateLabels.group.children.length)
    for (let i = 0; i < 100; i++) {
      const angle = i / 10
      viewport.camera.position.set(Math.cos(angle) * 10, 5, Math.sin(angle) * 10)
      viewport.controls.update()
      vi.runAllTimers()
    }
    expect(viewport.renderer.info.memory).toEqual(initial)
    viewport.dispose()
  })

  it('does not update projection for microscopic movements inside the clipping band', () => {
    const viewport = mount()
    const projectionUpdate = vi.spyOn(viewport.camera, 'updateProjectionMatrix')
    for (let i = 0; i < 100; i++) {
      viewport.camera.position.x += 0.0001
      viewport.controls.update()
      vi.runAllTimers()
    }
    expect(projectionUpdate).not.toHaveBeenCalled()
    viewport.dispose()
  })

  it.each([NaN, Infinity, -Infinity])(
    'restores the last finite camera and target after %s corruption',
    (invalid) => {
      const viewport = mount()
      viewport.camera.position.set(50, 30, 10)
      viewport.controls.target.set(40, 0, 0)
      viewport.controls.update()
      vi.runAllTimers()
      const position = viewport.camera.position.clone()
      const target = viewport.controls.target.clone()
      const quaternion = viewport.camera.quaternion.clone()
      viewport.camera.position.x = invalid
      viewport.controls.target.z = invalid
      viewport.controls.update()
      viewport.requestRender()
      vi.runAllTimers()
      expect(viewport.camera.position).toEqual(position)
      expect(viewport.controls.target).toEqual(target)
      expect(viewport.camera.quaternion.toArray()).toEqual(quaternion.toArray())
      expect(viewport.camera.matrixWorld.elements.every(Number.isFinite)).toBe(true)
      viewport.camera.position.y += 1
      viewport.controls.update()
      vi.runAllTimers()
      expect(viewport.camera.position.y).toBeCloseTo(position.y + 1)
      viewport.dispose()
    },
  )
})

describe('direct manipulation boundary', () => {
  const mount = () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800 })
    Object.defineProperty(container, 'clientHeight', { value: 600 })
    const viewport = mountHarukaViewport(container)
    vi.spyOn(viewport.renderer.domElement, 'getBoundingClientRect').mockReturnValue({
      left: 300,
      top: 40,
      width: 800,
      height: 600,
    } as DOMRect)
    vi.runAllTimers()
    return viewport
  }
  const screenOf = (viewport: HarukaViewport, point: Vector3) => {
    const { x, y } = point.clone().project(viewport.camera)
    return [300 + ((x + 1) / 2) * 800, 40 + ((1 - y) / 2) * 600] as const
  }

  it('hit-tests only the rendered cube body, including shear, reflection and negative scale', () => {
    const viewport = mount()
    const matrix = multiply(
      toMatrix({ type: 'translation', x: 3, y: 1, z: -2 }),
      multiply(
        toMatrix({ type: 'reflection', plane: 'yz' }),
        multiply(
          toMatrix({ type: 'shear', kxy: 0.8, kxz: 0, kyx: 0, kyz: 0.4, kzx: 0, kzy: 0 }),
          toMatrix({ type: 'scale', x: -1.5, y: 2, z: 1 }),
        ),
      ),
    )
    viewport.sync({ matrix, vertices: transformCubeVertices(matrix) })
    const center = new Vector3(...transformPoint(matrix, [0, 0, 0]))
    expect(viewport.pick(...screenOf(viewport, center))).toBe(true)
    expect(viewport.pick(...screenOf(viewport, new Vector3(0, 0, 0)))).toBe(false)
    expect(viewport.pick(...screenOf(viewport, new Vector3(-6, 0, 6)))).toBe(false)
    viewport.dispose()
  })

  it('gives the object exclusive ownership of the gesture only while manipulation is active', () => {
    const viewport = mount()
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    expect(viewport.controls.enabled).toBe(true)
    viewport.setManipulation({ selected: true, active: false })
    expect(viewport.controls.enabled).toBe(true)
    viewport.setManipulation({ selected: true, active: true })
    expect(viewport.controls.enabled).toBe(false)
    viewport.setManipulation({ selected: true, active: false })
    expect(viewport.controls.enabled).toBe(true)
    vi.runAllTimers()
    const frames = raf.mock.calls.length
    vi.advanceTimersByTime(5000)
    expect(raf.mock.calls.length).toBe(frames)
    viewport.setManipulation({ selected: true, active: true })
    viewport.dispose()
    expect(viewport.controls.enabled).toBe(true)
  })

  it('derives a world-space drag delta from canvas-relative client coordinates', () => {
    const viewport = mount()
    const start = screenOf(viewport, new Vector3(0, 0, 0))
    const end = screenOf(viewport, new Vector3(2, 0, 0))
    const delta = viewport.dragDelta(start, end, [0, 0, 0], 'x')
    expect(delta![0]).toBeCloseTo(2, 6)
    expect(delta!.slice(1)).toEqual([0, 0])
    viewport.dispose()
  })

  describe('view axis lock 2D (orthographic camera lock)', () => {
    it('switches to real OrthographicCamera looking along axis, disables rotation, and matches frustum scale', () => {
      const viewport = mount()
      expect(
        (viewport.camera as unknown as { isPerspectiveCamera: boolean }).isPerspectiveCamera,
      ).toBe(true)
      expect(viewport.controls.enableRotate).toBe(true)

      const perspPos = viewport.camera.position.clone()
      const perspTarget = viewport.controls.target.clone()
      const d = perspPos.distanceTo(perspTarget)
      const expectedH =
        2 * d * Math.tan(((viewport.camera as unknown as PerspectiveCamera).fov * Math.PI) / 360)

      // Lock X
      viewport.setViewAxisLock('x')
      expect(
        (viewport.camera as unknown as { isOrthographicCamera: boolean }).isOrthographicCamera,
      ).toBe(true)
      expect(viewport.controls.enableRotate).toBe(false)
      expect(viewport.controls.enablePan).toBe(true)
      expect(viewport.controls.enableZoom).toBe(true)

      const ortho = viewport.camera as unknown as OrthographicCamera
      expect(ortho.top - ortho.bottom).toBeCloseTo(expectedH, 4)
      // Lock X looks from +X towards target
      expect(ortho.position.x).toBeGreaterThan(viewport.controls.target.x)
      expect(ortho.position.y).toBeCloseTo(viewport.controls.target.y, 4)
      expect(ortho.position.z).toBeCloseTo(viewport.controls.target.z, 4)

      viewport.dispose()
    })

    it('preserves the original perspective camera snapshot across multiple lock switches and restores it on null', () => {
      const viewport = mount()
      const initialPos = viewport.camera.position.clone()
      const initialTarget = viewport.controls.target.clone()

      viewport.setViewAxisLock('x')
      expect(
        (viewport.camera as unknown as { isOrthographicCamera: boolean }).isOrthographicCamera,
      ).toBe(true)

      // Switch X -> Y: must preserve original perspective snapshot, not overwrite with ortho coords
      viewport.setViewAxisLock('y')
      expect(
        (viewport.camera as unknown as { isOrthographicCamera: boolean }).isOrthographicCamera,
      ).toBe(true)
      const orthoY = viewport.camera as unknown as OrthographicCamera
      expect(orthoY.position.y).toBeGreaterThan(viewport.controls.target.y)

      // Switch Y -> Z
      viewport.setViewAxisLock('z')
      expect(
        (viewport.camera as unknown as { isOrthographicCamera: boolean }).isOrthographicCamera,
      ).toBe(true)
      const orthoZ = viewport.camera as unknown as OrthographicCamera
      expect(orthoZ.position.z).toBeGreaterThan(viewport.controls.target.z)

      // Switch back to null: restores original free camera
      viewport.setViewAxisLock(null)
      expect(
        (viewport.camera as unknown as { isPerspectiveCamera: boolean }).isPerspectiveCamera,
      ).toBe(true)
      expect(viewport.controls.enableRotate).toBe(true)
      expect(viewport.camera.position.toArray()).toEqual(initialPos.toArray())
      expect(viewport.controls.target.toArray()).toEqual(initialTarget.toArray())

      viewport.dispose()
    })

    it('centers the cube via locateCube during lock without breaking the lock or switching to perspective', () => {
      const viewport = mount()
      viewport.sync({
        matrix: toMatrix({ type: 'translation', x: 5, y: 3, z: -4 }),
        vertices: transformCubeVertices(toMatrix({ type: 'translation', x: 5, y: 3, z: -4 })),
      })

      viewport.setViewAxisLock('z')
      expect(
        (viewport.camera as unknown as { isOrthographicCamera: boolean }).isOrthographicCamera,
      ).toBe(true)

      viewport.locateCube()

      // Lock is still active and camera is still orthographic
      expect(
        (viewport.camera as unknown as { isOrthographicCamera: boolean }).isOrthographicCamera,
      ).toBe(true)
      expect(viewport.controls.enableRotate).toBe(false)
      // Controls target centered on cube (x=5, y=3, z=-4)
      expect(viewport.controls.target.x).toBeCloseTo(5, 4)
      expect(viewport.controls.target.y).toBeCloseTo(3, 4)
      expect(viewport.controls.target.z).toBeCloseTo(-4, 4)

      viewport.dispose()
    })

    it('aligns reference grid plane and occludes rear vertex labels according to axis lock', () => {
      const viewport = mount()
      const gridMesh = viewport.grid.group.children.find((child) => child instanceof Mesh) as Mesh
      const labelGroup = viewport.scene.getObjectByName('vertex-labels') as Group

      // Lock X: grid becomes YZ plane, rear vertex labels are occluded
      viewport.setViewAxisLock('x')
      vi.runAllTimers()
      expect(gridMesh.rotation.y).toBeCloseTo(Math.PI / 2)
      expect(labelGroup.children.filter((c) => c.visible)).toHaveLength(4)

      // Lock Z: grid becomes XY plane
      viewport.setViewAxisLock('z')
      vi.runAllTimers()
      expect(gridMesh.rotation.y).toBeCloseTo(0)
      expect(gridMesh.rotation.x).toBeCloseTo(0)
      expect(labelGroup.children.filter((c) => c.visible)).toHaveLength(4)

      // Unlock: grid returns to XZ plane, all labels visible
      viewport.setViewAxisLock(null)
      vi.runAllTimers()
      expect(gridMesh.rotation.x).toBeCloseTo(-Math.PI / 2)
      expect(labelGroup.children.filter((c) => c.visible)).toHaveLength(8)

      viewport.dispose()
    })

    it('keeps reference plane at controls.target during cube sync without dragging (Requirement 46)', () => {
      const viewport = mount()
      const gridMesh = viewport.grid.group.children.find((child) => child instanceof Mesh) as Mesh
      viewport.controls.target.set(0, 2000, 0)
      viewport.requestRender()
      vi.runAllTimers()

      // Sync cube moving from 2000 to 2100 to 5000
      for (const y of [2000, 2100, 5000]) {
        viewport.sync({
          matrix: toMatrix({ type: 'translation', x: 0, y, z: 0 }),
          vertices: transformCubeVertices(toMatrix({ type: 'translation', x: 0, y, z: 0 })),
        })
        vi.runAllTimers()
        expect(gridMesh.position.y).toBe(2000)
      }

      viewport.dispose()
    })

    it('performs center and 2D fit for orthographic lock with vertices in comfortable NDC bounds (Requirement 53, 54)', () => {
      const viewport = mount()

      for (const lock of ['x', 'y', 'z'] as const) {
        // Complex transform: non-uniform scale + rotation + shear
        const transform = composeTransforms([
          { type: 'rotation', axis: 'y', angle: Math.PI / 6 },
          { type: 'shear', kxy: 0.3, kxz: 0, kyx: 0, kyz: 0, kzx: 0, kzy: 0 },
          { type: 'scale', x: 4, y: 2, z: 3 },
          { type: 'translation', x: 500, y: 2000, z: -900 },
        ])
        const vertices = transformCubeVertices(transform)
        viewport.sync({ matrix: transform, vertices })

        viewport.setViewAxisLock(lock)
        // Simulate arbitrary user zoom prior to locate
        ;(viewport.camera as OrthographicCamera).zoom = 0.05
        viewport.camera.updateProjectionMatrix()

        viewport.locateCube()
        vi.runAllTimers()

        expect(viewport.camera).toBeInstanceOf(OrthographicCamera)
        const ortho = viewport.camera as OrthographicCamera
        ortho.updateMatrixWorld()

        // All 8 vertices must project into comfortable NDC space (|ndc| < 0.8)
        let maxNdc = 0
        for (const vertex of vertices) {
          const projected = new Vector3(...vertex.point).project(ortho)
          expect(Math.abs(projected.x)).toBeLessThan(0.8)
          expect(Math.abs(projected.y)).toBeLessThan(0.8)
          maxNdc = Math.max(maxNdc, Math.abs(projected.x), Math.abs(projected.y))
        }
        // And not be microscopically tiny (should occupy >= 30% of NDC space)
        expect(maxNdc).toBeGreaterThanOrEqual(0.3)
      }

      viewport.dispose()
    })

    it('yields identical screen extent for huge translation after locate (Requirement 55)', () => {
      const viewport = mount()
      viewport.setViewAxisLock('z')

      // Unit cube at origin
      viewport.sync({
        matrix: toMatrix({ type: 'translation', x: 0, y: 0, z: 0 }),
        vertices: transformCubeVertices(toMatrix({ type: 'translation', x: 0, y: 0, z: 0 })),
      })
      viewport.locateCube()
      vi.runAllTimers()
      const ortho = viewport.camera as OrthographicCamera
      const originHeight = ortho.top - ortho.bottom

      // Same unit cube translated to [1e6, 2e6, -3e6]
      const hugeVertices = transformCubeVertices(
        toMatrix({ type: 'translation', x: 1e6, y: 2e6, z: -3e6 }),
      )
      viewport.sync({
        matrix: toMatrix({ type: 'translation', x: 1e6, y: 2e6, z: -3e6 }),
        vertices: hugeVertices,
      })
      viewport.locateCube()
      vi.runAllTimers()
      const hugeHeight = ortho.top - ortho.bottom

      expect(hugeHeight).toBeCloseTo(originHeight, 3)
      viewport.dispose()
    })

    it('safely handles degenerate collapsed geometry in locateCube (Requirement 56)', () => {
      const viewport = mount()
      viewport.setViewAxisLock('x')

      const flatVertices = transformCubeVertices(toMatrix({ type: 'scale', x: 0, y: 0, z: 0 }))
      viewport.sync({
        matrix: toMatrix({ type: 'scale', x: 0, y: 0, z: 0 }),
        vertices: flatVertices,
      })

      viewport.locateCube()
      vi.runAllTimers()

      const ortho = viewport.camera as OrthographicCamera
      expect(Number.isFinite(ortho.top)).toBe(true)
      expect(Number.isFinite(ortho.bottom)).toBe(true)
      expect(Number.isFinite(ortho.left)).toBe(true)
      expect(Number.isFinite(ortho.right)).toBe(true)
      expect(ortho.top).toBeGreaterThan(ortho.bottom)

      viewport.dispose()
    })

    it('preserves initial free camera snapshot across multiple locks and locates (Requirement 57)', () => {
      const viewport = mount()
      const initialPos = viewport.camera.position.clone()
      const initialTarget = viewport.controls.target.clone()

      viewport.setViewAxisLock('x')
      viewport.locateCube()

      viewport.setViewAxisLock('y')
      viewport.locateCube()

      viewport.setViewAxisLock(null)

      expect(viewport.camera.position.toArray()).toEqual(initialPos.toArray())
      expect(viewport.controls.target.toArray()).toEqual(initialTarget.toArray())

      viewport.dispose()
    })

    it('provides semantic slice label via referenceFrame property (Requirement 58)', () => {
      const viewport = mount()
      viewport.controls.target.set(100, 200, 2000)
      viewport.setViewAxisLock('z')
      vi.runAllTimers()

      const frame = viewport.referenceFrame
      expect(frame).toBeDefined()
      expect(frame.plane).toBe('xy')
      expect(frame.normalAxis).toBe('z')
      expect(frame.normalValue).toBe(2000)
      expect(frame.sliceLabel).toBe('XY · Z = 2000')

      viewport.dispose()
    })

    it('positions reference plane and updates slice label in free view for Y=200 and Y=2000 (Smoke 60, 61)', () => {
      const viewport = mount()
      const gridMesh = viewport.grid.group.children.find((child) => child instanceof Mesh) as Mesh

      for (const y of [200, 2000]) {
        viewport.sync({
          matrix: toMatrix({ type: 'translation', x: 0, y, z: 0 }),
          vertices: transformCubeVertices(toMatrix({ type: 'translation', x: 0, y, z: 0 })),
        })
        viewport.locateCube()
        vi.runAllTimers()

        expect(viewport.controls.target.y).toBeCloseTo(y)
        expect(gridMesh.position.y).toBeCloseTo(y)
        expect(viewport.referenceFrame.sliceLabel).toBe(`XZ · Y = ${y}`)
      }

      viewport.dispose()
    })

    it('recovers from extreme zoom-out during lock to comfortable bounds on Locate Cube (Smoke 67)', () => {
      const viewport = mount()
      viewport.setViewAxisLock('z')
      const ortho = viewport.camera as OrthographicCamera

      // Extreme zoom out
      ortho.zoom = 0.0001
      ortho.updateProjectionMatrix()
      vi.runAllTimers()

      viewport.locateCube()
      vi.runAllTimers()

      expect(ortho.zoom).toBe(1)
      const visibleHeight = ortho.top - ortho.bottom
      expect(visibleHeight).toBeGreaterThan(1)
      expect(visibleHeight).toBeLessThan(10)

      viewport.dispose()
    })

    it('recovers from extensive camera panning on Locate Cube (Smoke 68)', () => {
      const viewport = mount()
      viewport.setViewAxisLock('x')

      // Pan camera far away
      viewport.controls.target.set(9999, -5000, 8888)
      viewport.requestRender()
      vi.runAllTimers()

      viewport.locateCube()
      vi.runAllTimers()

      // Target centered on cube origin
      expect(viewport.controls.target.x).toBeCloseTo(0)
      expect(viewport.controls.target.y).toBeCloseTo(0)
      expect(viewport.controls.target.z).toBeCloseTo(0)

      viewport.dispose()
    })
  })
})
