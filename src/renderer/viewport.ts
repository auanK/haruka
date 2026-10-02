import { WebGLRenderer, type PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createHarukaScene, type HarukaScene } from './scene'

export type HarukaViewport = HarukaScene & {
  readonly renderer: WebGLRenderer
  readonly controls: OrbitControls
}

export const resizeViewport = (
  renderer: Pick<WebGLRenderer, 'setSize'>,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): void => {
  if (width <= 0 || height <= 0) return
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
}

export const mountHarukaViewport = (container: HTMLElement): HarukaViewport => {
  const renderer = new WebGLRenderer({ antialias: true })
  const graph = createHarukaScene()
  const { scene, camera } = graph
  renderer.setPixelRatio(window.devicePixelRatio)
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.update()
  const resize = () =>
    resizeViewport(renderer, camera, container.clientWidth, container.clientHeight)
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()
  renderer.setAnimationLoop(() => renderer.render(scene, camera))

  return {
    ...graph,
    renderer,
    controls,
    dispose: () => {
      renderer.setAnimationLoop(null)
      resizeObserver.disconnect()
      controls.dispose()
      graph.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
