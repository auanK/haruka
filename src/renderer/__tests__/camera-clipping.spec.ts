import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { deriveCameraClipping } from '../camera-clipping'

describe('deriveCameraClipping', () => {
  it.each([0, 0.001, 1, 100, 1000, 10000, 1000000, 1e100, 1e200, Number.MAX_VALUE])(
    'keeps clipping finite and ordered at distance %s without navigation bounds',
    (cameraDistance) => {
      const clipping = deriveCameraClipping({ cameraDistance, objectRadius: 0.866 })
      expect(Object.keys(clipping).sort()).toEqual(['far', 'near'])
      expect(Number.isFinite(clipping.near)).toBe(true)
      expect(Number.isFinite(clipping.far)).toBe(true)
      expect(clipping.near).toBeGreaterThan(0)
      expect(clipping.far).toBeGreaterThan(clipping.near)
      const camera = new PerspectiveCamera(45, 1, clipping.near, clipping.far)
      expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true)
    },
  )

  it('grows far for distant cameras and large objects', () => {
    const initial = deriveCameraClipping({ cameraDistance: 10, objectRadius: 1 })
    const distant = deriveCameraClipping({ cameraDistance: 1000000, objectRadius: 1 })
    const large = deriveCameraClipping({ cameraDistance: 10, objectRadius: 1000000 })
    expect(distant.far).toBeGreaterThan(1000000)
    expect(large.far).toBeGreaterThan(1000000)
    expect(distant.far).toBeGreaterThan(initial.far)
  })

  it.each([NaN, Infinity, -Infinity, -1])(
    'uses finite fallbacks for invalid input %s',
    (invalid) => {
      const { near, far } = deriveCameraClipping({ cameraDistance: invalid, objectRadius: invalid })
      expect(Number.isFinite(near) && Number.isFinite(far)).toBe(true)
      expect(near).toBeGreaterThan(0)
      expect(far).toBeGreaterThan(near)
    },
  )
})
