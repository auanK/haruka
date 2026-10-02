import { describe, it, expect, vi } from 'vitest'
import { PerspectiveCamera, type WebGLRenderer } from 'three'
import { resizeViewport } from '../viewport'

describe('resizeViewport', () => {
  it('updates renderer size, camera aspect and projection for rectangular and square containers', () => {
    const renderer = { setSize: vi.fn<WebGLRenderer['setSize']>() }
    const camera = new PerspectiveCamera(45, 1, 0.1, 100)

    resizeViewport(renderer, camera, 1600, 800)

    expect(camera.aspect).toBe(2)
    expect(camera.projectionMatrix).toEqual(new PerspectiveCamera(45, 2, 0.1, 100).projectionMatrix)
    expect(renderer.setSize).toHaveBeenLastCalledWith(1600, 800, false)

    resizeViewport(renderer, camera, 800, 800)

    expect(camera.aspect).toBe(1)
    expect(camera.projectionMatrix).toEqual(new PerspectiveCamera(45, 1, 0.1, 100).projectionMatrix)
    expect(renderer.setSize).toHaveBeenLastCalledWith(800, 800, false)
    expect(renderer.setSize).toHaveBeenCalledTimes(2)
  })

  it.each([
    [1600, 0],
    [0, 800],
    [-1, 800],
    [1600, -1],
  ])('ignores invalid container dimensions %i × %i', (width, height) => {
    const renderer = { setSize: vi.fn<WebGLRenderer['setSize']>() }
    const camera = new PerspectiveCamera(45, 2, 0.1, 100)
    const projection = camera.projectionMatrix.clone()

    resizeViewport(renderer, camera, width, height)

    expect(camera.aspect).toBe(2)
    expect(camera.projectionMatrix).toEqual(projection)
    expect(renderer.setSize).not.toHaveBeenCalled()
  })
})
