import { Vector3, WebGLRenderer, type PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { cubeVertices, type CubeVertex } from '../app/didactic-cube'
import type { Matrix4 as HarukaMatrix4 } from '../domain'
import { deriveCameraClipping } from './camera-clipping'
import { createOrientationGizmo, type OrientationGizmo } from './orientation-gizmo'
import { DEFAULT_MAX_WEBGL_DPR, resolveRenderPixelRatio } from './pixel-ratio'
import { createRenderScheduler, type RenderScheduler } from './render-scheduler'
import { createHarukaScene, type HarukaScene } from './scene'
import { applyHarukaMatrixToObject } from './three-matrix'

export const MAX_WEBGL_DPR = DEFAULT_MAX_WEBGL_DPR

export type HarukaViewport = HarukaScene & {
  readonly renderer: WebGLRenderer
  readonly controls: OrbitControls
  readonly requestRender: () => void
  readonly sync: (data: {
    readonly matrix: HarukaMatrix4
    readonly vertices: readonly CubeVertex[]
  }) => void
  readonly locateCube: () => void
  readonly dispose: () => void
}

export const resizeViewport = (
  renderer: Pick<WebGLRenderer, 'setDrawingBufferSize'>,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  pixelRatio = 1,
): void => {
  if (width <= 0 || height <= 0) return
  if (camera.aspect !== width / height) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
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
  focusTarget?: Vector3,
  cameraDirty = true,
): void => {
  const margin = 12
  const maxSize = 96
  const availableWidth = width - margin * 2
  const availableHeight = height - margin * 2
  const hasOverlay = availableWidth > 0 && availableHeight > 0

  if (cameraDirty) graph.updateScene(width, height, focusTarget)

  // Render world-space grid, coordinate labels and cube together.
  if (hasOverlay) {
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
  }

  renderer.render(graph.scene, graph.camera)

  if (!hasOverlay) return

  // The orientation gizmo is the only viewport-space annotation.
  const size = Math.min(maxSize, availableWidth, availableHeight)
  const x = width - size - margin
  const y = height - size - margin

  if (cameraDirty) gizmo.updateOrientation(graph.camera)
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

  renderer.initTexture(graph.coordinateLabels.texture)

  let lastCssWidth = 0
  let lastCssHeight = 0
  let lastPixelRatio = 0
  let cameraDirty = true
  let resizeDirty = true

  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
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
    const q = camera.quaternion
    const distance = Math.hypot(
      camera.position.x - controls.target.x,
      camera.position.y - controls.target.y,
      camera.position.z - controls.target.z,
    )
    if (
      isFiniteVector(camera.position) &&
      isFiniteVector(controls.target) &&
      Number.isFinite(distance) &&
      Number.isFinite(q.x) &&
      Number.isFinite(q.y) &&
      Number.isFinite(q.z) &&
      Number.isFinite(q.w)
    ) {
      lastPosition.copy(camera.position)
      lastTarget.copy(controls.target)
      lastQuaternion.copy(q)
    } else {
      camera.position.copy(lastPosition)
      controls.target.copy(lastTarget)
      camera.quaternion.copy(lastQuaternion)
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
        resizeViewport(renderer, camera, width, height, pixelRatio)
        cameraDirty = true
      }
    }

    const updateCamera = cameraDirty
    cameraDirty = false
    if (updateCamera) validateCamera()
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
    renderViewport(renderer, graph, gizmo, width, height, controls.target, updateCamera)
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

  const locateCube = () => {
    const { center, radius } = computeVerticesBounds(latestVertices)
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
    graph.updateVertexLabels(vertices)

    cubeBounds = computeVerticesBounds(vertices)

    scheduler.requestRender()
  }

  // Request initial frame
  scheduler.requestRender()

  return {
    ...graph,
    renderer,
    controls,
    requestRender: onControlsChange,
    sync,
    locateCube,
    dispose: () => {
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
