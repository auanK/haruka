import {
  OrthographicCamera,
  Raycaster,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Camera,
  type PerspectiveCamera,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { cubeVertices, type CubeVertex } from '../app/didactic-cube'
import type { AxisConstraint, LockedAxis } from '../app/direct-manipulation'
import type { Matrix4 as HarukaMatrix4, Point3 } from '../domain'
import { deriveCameraClipping } from './camera-clipping'
import { createOrientationGizmo, type OrientationGizmo } from './orientation-gizmo'
import { DEFAULT_MAX_WEBGL_DPR, resolveRenderPixelRatio } from './pixel-ratio'
import { createRenderScheduler, type RenderScheduler } from './render-scheduler'
import { createHarukaScene, type HarukaScene } from './scene'
import { deriveReferenceFrame, type ReferenceFrame } from './reference-frame'
import { deriveOrthographicFit, projectVerticesToViewPlane } from './orthographic-fit'
import { applyHarukaMatrixToObject } from './three-matrix'
import { deriveTranslationDelta, toNdc } from './translation-drag'

export const MAX_WEBGL_DPR = DEFAULT_MAX_WEBGL_DPR

export type ViewAxisLock = 'x' | 'y' | 'z' | null

export type HarukaViewport = Omit<HarukaScene, 'camera'> & {
  readonly camera: PerspectiveCamera | OrthographicCamera
  readonly perspectiveCamera: PerspectiveCamera
  readonly orthographicCamera: OrthographicCamera
  readonly renderer: WebGLRenderer
  readonly controls: OrbitControls
  readonly requestRender: () => void
  readonly sync: (data: {
    readonly matrix: HarukaMatrix4
    readonly vertices: readonly CubeVertex[]
  }) => void
  readonly locateCube: () => void
  readonly pick: (clientX: number, clientY: number) => boolean
  readonly dragDelta: (
    startScreen: readonly [number, number],
    currentScreen: readonly [number, number],
    pivot: Point3,
    axis?: AxisConstraint,
    lockedAxis?: LockedAxis,
  ) => Point3 | null
  readonly setManipulation: (data: { readonly selected: boolean; readonly active: boolean }) => void
  readonly setViewAxisLock: (lock: ViewAxisLock) => void
  readonly referenceFrame: ReferenceFrame
  readonly dispose: () => void
}

export const resizeViewport = (
  renderer: Pick<WebGLRenderer, 'setDrawingBufferSize'>,
  camera: Camera,
  width: number,
  height: number,
  pixelRatio = 1,
): void => {
  if (width <= 0 || height <= 0) return
  const aspect = width / height
  if (
    'isOrthographicCamera' in camera &&
    (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera
  ) {
    const ortho = camera as OrthographicCamera
    const currentHeight = ortho.top - ortho.bottom
    const currentWidth = currentHeight * aspect
    ortho.left = -currentWidth / 2
    ortho.right = currentWidth / 2
    ortho.updateProjectionMatrix()
  } else if (
    'isPerspectiveCamera' in camera &&
    (camera as { isPerspectiveCamera?: boolean }).isPerspectiveCamera
  ) {
    const persp = camera as PerspectiveCamera
    if (persp.aspect !== aspect) {
      persp.aspect = aspect
      persp.updateProjectionMatrix()
    }
  }
  renderer.setDrawingBufferSize(width, height, pixelRatio)
}

export const renderViewport = (
  renderer: Pick<
    WebGLRenderer,
    'autoClear' | 'clearDepth' | 'render' | 'setScissor' | 'setScissorTest' | 'setViewport'
  >,
  graph: Pick<HarukaScene, 'scene' | 'camera' | 'updateScene'>,
  gizmo: Pick<OrientationGizmo, 'scene' | 'camera' | 'updateOrientation'>,
  width: number,
  height: number,
  navigationTarget?: Vector3,
  cameraDirty = true,
  activeCamera?: Camera,
  activePlane?: 'xz' | 'yz' | 'xy',
): void => {
  const cam = activeCamera ?? graph.camera
  const margin = 12
  const maxSize = 96
  const availableWidth = width - margin * 2
  const availableHeight = height - margin * 2
  const hasOverlay = availableWidth > 0 && availableHeight > 0

  if (cameraDirty) {
    if (activePlane !== undefined) {
      graph.updateScene(width, height, navigationTarget, cam, activePlane)
    } else if (cam && cam !== graph.camera) {
      graph.updateScene(width, height, navigationTarget, cam)
    } else {
      graph.updateScene(width, height, navigationTarget)
    }
  }

  // Render world-space grid, coordinate labels and cube together.
  if (hasOverlay) {
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
  }

  renderer.render(graph.scene, cam)

  if (!hasOverlay) return

  // The orientation gizmo is the only viewport-space annotation.
  const size = Math.min(maxSize, availableWidth, availableHeight)
  const x = width - size - margin
  const y = height - size - margin

  if (cameraDirty) gizmo.updateOrientation(cam)
  renderer.clearDepth()
  renderer.autoClear = false
  renderer.setScissorTest(true)
  renderer.setScissor(x, y, size, size)
  renderer.setViewport(x, y, size, size)
  renderer.render(gizmo.scene, gizmo.camera)
  renderer.setScissorTest(false)
  renderer.setScissor(0, 0, width, height)
  renderer.setViewport(0, 0, width, height)
  renderer.autoClear = true
}

const computeVerticesBounds = (
  vertices: readonly CubeVertex[],
): { readonly center: Vector3; readonly radius: number } => {
  const center = new Vector3()
  if (vertices.length === 0) {
    return { center, radius: 0.866 }
  }

  for (const v of vertices) {
    center.x += v.point[0]
    center.y += v.point[1]
    center.z += v.point[2]
  }
  center.divideScalar(vertices.length)

  let maxRadius = 0
  for (const v of vertices) {
    const d = Math.hypot(v.point[0] - center.x, v.point[1] - center.y, v.point[2] - center.z)
    if (d > maxRadius) maxRadius = d
  }

  return { center, radius: maxRadius }
}

export const mountHarukaViewport = (container: HTMLElement): HarukaViewport => {
  const renderer = new WebGLRenderer({
    antialias: false,
    stencil: false,
  })
  const graph = createHarukaScene()
  const gizmo = createOrientationGizmo()
  const { camera } = graph
  const orthographicCamera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 2000)
  let activeCamera: PerspectiveCamera | OrthographicCamera = camera
  let activeLock: ViewAxisLock = null
  let freeCameraSnapshot: { position: Vector3; target: Vector3; zoom: number } | null = null

  renderer.initTexture(graph.coordinateLabels.texture)

  let lastCssWidth = 0
  let lastCssHeight = 0
  let lastPixelRatio = 0
  let cameraDirty = true
  let resizeDirty = true

  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera as Camera, renderer.domElement)
  controls.enableDamping = false
  controls.enablePan = true
  controls.enableRotate = true
  controls.enableZoom = true

  controls.minDistance = 0
  controls.maxDistance = Infinity
  controls.update()

  let latestVertices: readonly CubeVertex[] = cubeVertices
  let cubeBounds = computeVerticesBounds(latestVertices)
  const lastPosition = camera.position.clone()
  const lastTarget = controls.target.clone()
  const lastQuaternion = camera.quaternion.clone()
  const isFiniteVector = (vector: Vector3) =>
    Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z)
  const validateCamera = () => {
    const q = activeCamera.quaternion
    const distance = Math.hypot(
      activeCamera.position.x - controls.target.x,
      activeCamera.position.y - controls.target.y,
      activeCamera.position.z - controls.target.z,
    )
    if (
      isFiniteVector(activeCamera.position) &&
      isFiniteVector(controls.target) &&
      Number.isFinite(distance) &&
      Number.isFinite(q.x) &&
      Number.isFinite(q.y) &&
      Number.isFinite(q.z) &&
      Number.isFinite(q.w)
    ) {
      lastPosition.copy(activeCamera.position)
      lastTarget.copy(controls.target)
      lastQuaternion.copy(q)
    } else {
      activeCamera.position.copy(lastPosition)
      controls.target.copy(lastTarget)
      activeCamera.quaternion.copy(lastQuaternion)
    }
  }

  const scheduler: RenderScheduler = createRenderScheduler(() => {
    const width = container.clientWidth
    const height = container.clientHeight
    if (width <= 0 || height <= 0) return

    if (resizeDirty) {
      resizeDirty = false
      const pixelRatio = resolveRenderPixelRatio({
        cssWidth: width,
        cssHeight: height,
        devicePixelRatio: window.devicePixelRatio || 1,
        maxDpr: DEFAULT_MAX_WEBGL_DPR,
      })
      if (width !== lastCssWidth || height !== lastCssHeight || pixelRatio !== lastPixelRatio) {
        lastCssWidth = width
        lastCssHeight = height
        lastPixelRatio = pixelRatio
        resizeViewport(renderer, activeCamera, width, height, pixelRatio)
        cameraDirty = true
      }
    }

    const updateCamera = cameraDirty
    cameraDirty = false
    if (updateCamera) validateCamera()
    if (activeLock === null) {
      const { near, far } = deriveCameraClipping({
        cameraDistance: Math.hypot(
          camera.position.x - controls.target.x,
          camera.position.y - controls.target.y,
          camera.position.z - controls.target.z,
        ),
        objectRadius:
          cubeBounds.radius +
          Math.hypot(
            cubeBounds.center.x - controls.target.x,
            cubeBounds.center.y - controls.target.y,
            cubeBounds.center.z - controls.target.z,
          ),
      })
      // The derived planes include ample margin; retain the current band between significant changes.
      if (
        near < camera.near / 2 ||
        near > camera.near * 2 ||
        far > camera.far * 2 ||
        far < camera.far / 4
      ) {
        camera.near = near
        camera.far = far
        camera.updateProjectionMatrix()
      }
    }
    const activePlane =
      activeLock === 'x' ? 'yz' : activeLock === 'y' ? 'xz' : activeLock === 'z' ? 'xy' : 'xz'
    if (activeLock !== null) {
      graph.updateVertexLabels(latestVertices, activeCamera, true)
    }
    renderViewport(
      renderer,
      graph,
      gizmo,
      width,
      height,
      controls.target,
      updateCamera,
      activeCamera,
      activePlane,
    )
  })

  const onControlsChange = () => {
    cameraDirty = true
    scheduler.requestRender()
  }
  controls.addEventListener('change', onControlsChange)

  const onResize = () => {
    const width = container.clientWidth
    const height = container.clientHeight
    if (width <= 0 || height <= 0) return

    const pixelRatio = resolveRenderPixelRatio({
      cssWidth: width,
      cssHeight: height,
      devicePixelRatio: window.devicePixelRatio || 1,
      maxDpr: DEFAULT_MAX_WEBGL_DPR,
    })

    if (width === lastCssWidth && height === lastCssHeight && pixelRatio === lastPixelRatio) return
    resizeDirty = true
    scheduler.requestRender()
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
  resizeObserver?.observe(container)

  const setViewAxisLock = (lock: ViewAxisLock) => {
    if (lock === activeLock) return

    if (lock === null) {
      if (freeCameraSnapshot) {
        camera.position.copy(freeCameraSnapshot.position)
        controls.target.copy(freeCameraSnapshot.target)
        camera.zoom = freeCameraSnapshot.zoom
        camera.updateProjectionMatrix()
        freeCameraSnapshot = null
      }
      activeLock = null
      activeCamera = camera
      controls.object = camera
      controls.enableRotate = true
      controls.update()
      graph.updateVertexLabels(latestVertices, activeCamera, false)
      onControlsChange()
      return
    }

    if (activeLock === null) {
      freeCameraSnapshot = {
        position: camera.position.clone(),
        target: controls.target.clone(),
        zoom: camera.zoom,
      }
      const distance = Math.max(camera.position.distanceTo(controls.target), 1e-4)
      const vFovRad = (camera.fov * Math.PI) / 360
      const H = 2 * distance * Math.tan(vFovRad)
      const aspect =
        lastCssWidth > 0 && lastCssHeight > 0 ? lastCssWidth / lastCssHeight : camera.aspect
      const W = H * aspect

      orthographicCamera.left = -W / 2
      orthographicCamera.right = W / 2
      orthographicCamera.top = H / 2
      orthographicCamera.bottom = -H / 2
      orthographicCamera.zoom = 1
      orthographicCamera.near = 0.1
      orthographicCamera.far = Math.max(distance + 1000, 2000)
    }

    activeLock = lock
    const target = controls.target
    const distance = Math.max(
      freeCameraSnapshot
        ? freeCameraSnapshot.position.distanceTo(freeCameraSnapshot.target)
        : camera.position.distanceTo(controls.target),
      1e-4,
    )

    if (lock === 'x') {
      orthographicCamera.position.set(target.x + distance, target.y, target.z)
      orthographicCamera.up.set(0, 1, 0)
    } else if (lock === 'y') {
      orthographicCamera.position.set(target.x, target.y + distance, target.z)
      orthographicCamera.up.set(0, 0, -1)
    } else if (lock === 'z') {
      orthographicCamera.position.set(target.x, target.y, target.z + distance)
      orthographicCamera.up.set(0, 1, 0)
    }

    orthographicCamera.lookAt(target)
    orthographicCamera.updateProjectionMatrix()

    activeCamera = orthographicCamera
    controls.object = orthographicCamera
    controls.enableRotate = false
    controls.enablePan = true
    controls.enableZoom = true
    controls.update()
    graph.updateVertexLabels(latestVertices, activeCamera, true)
    onControlsChange()
  }

  const locateCube = () => {
    const { center, radius } = computeVerticesBounds(latestVertices)
    if (activeLock !== null) {
      controls.target.copy(center)
      const distance = Math.max(
        freeCameraSnapshot
          ? freeCameraSnapshot.position.distanceTo(freeCameraSnapshot.target)
          : camera.position.distanceTo(controls.target),
        50,
      )
      if (activeLock === 'x') {
        orthographicCamera.position.set(center.x + distance, center.y, center.z)
      } else if (activeLock === 'y') {
        orthographicCamera.position.set(center.x, center.y + distance, center.z)
      } else if (activeLock === 'z') {
        orthographicCamera.position.set(center.x, center.y, center.z + distance)
      }
      orthographicCamera.lookAt(center)
      orthographicCamera.updateMatrixWorld(true)

      const cameraRight = new Vector3()
      const cameraUp = new Vector3()
      orthographicCamera.matrixWorld.extractBasis(cameraRight, cameraUp, new Vector3())
      const bounds = projectVerticesToViewPlane(latestVertices, cameraRight, cameraUp, center)
      const aspect =
        lastCssWidth > 0 && lastCssHeight > 0
          ? lastCssWidth / lastCssHeight
          : orthographicCamera.right > orthographicCamera.left
            ? (orthographicCamera.right - orthographicCamera.left) /
              (orthographicCamera.top - orthographicCamera.bottom)
            : 1
      const fit = deriveOrthographicFit({
        projectedWidth: bounds.width,
        projectedHeight: bounds.height,
        viewportAspect: aspect,
        padding: 1.8,
      })
      orthographicCamera.top = fit.halfHeight
      orthographicCamera.bottom = -fit.halfHeight
      orthographicCamera.left = -fit.halfWidth
      orthographicCamera.right = fit.halfWidth
      orthographicCamera.zoom = 1
      orthographicCamera.updateProjectionMatrix()

      controls.update()
      onControlsChange()
      return
    }

    const isoDirection = new Vector3(1, 1, 1).normalize()
    const vFovRad = (camera.fov * Math.PI) / 360
    const halfFov = Math.min(vFovRad, Math.atan(Math.tan(vFovRad) * camera.aspect))
    const distance = (Math.max(radius, 1e-6) / Math.sin(halfFov)) * 1.25

    controls.target.copy(center)
    camera.position.copy(center).addScaledVector(isoDirection, distance)
    camera.lookAt(center)
    controls.update()

    onControlsChange()
  }

  const sync = ({
    matrix,
    vertices,
  }: {
    readonly matrix: HarukaMatrix4
    readonly vertices: readonly CubeVertex[]
  }) => {
    latestVertices = vertices
    applyHarukaMatrixToObject(graph.target, matrix)
    graph.updateVertexLabels(vertices, activeCamera, activeLock !== null)

    cubeBounds = computeVerticesBounds(vertices)

    scheduler.requestRender()
  }

  const raycaster = new Raycaster()
  const pick = (clientX: number, clientY: number): boolean => {
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    const [x, y] = toNdc(rect, [clientX, clientY])
    raycaster.setFromCamera(new Vector2(x, y), activeCamera)
    graph.target.updateMatrixWorld(true)
    const hits = raycaster.intersectObject(graph.body, false)
    return hits.length > 0
  }

  const dragDelta = (
    startScreen: readonly [number, number],
    currentScreen: readonly [number, number],
    pivot: Point3,
    axis: AxisConstraint = 'free',
    lockedAxis: LockedAxis = null,
  ): Point3 | null => {
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const startNdc = toNdc(rect, startScreen)
    const currentNdc = toNdc(rect, currentScreen)
    return deriveTranslationDelta(
      activeCamera,
      startNdc,
      currentNdc,
      pivot,
      axis,
      lockedAxis ?? activeLock,
    )
  }

  const setManipulation = ({
    selected,
    active,
  }: {
    readonly selected: boolean
    readonly active: boolean
  }): void => {
    controls.enabled = !active
    graph.setHighlight(selected)
    scheduler.requestRender()
  }

  // Request initial frame
  scheduler.requestRender()

  return {
    ...graph,
    get camera(): PerspectiveCamera | OrthographicCamera {
      return activeCamera
    },
    perspectiveCamera: camera,
    orthographicCamera,
    renderer,
    controls,
    requestRender: onControlsChange,
    sync,
    locateCube,
    pick,
    dragDelta,
    setManipulation,
    setViewAxisLock,
    get referenceFrame(): ReferenceFrame {
      return deriveReferenceFrame(activeLock)
    },
    dispose: () => {
      controls.enabled = true
      scheduler.dispose()
      resizeObserver?.disconnect()
      controls.removeEventListener('change', onControlsChange)
      controls.dispose()
      gizmo.dispose()
      graph.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
