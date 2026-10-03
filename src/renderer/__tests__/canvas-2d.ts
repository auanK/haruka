import { vi } from 'vitest'

export const mockCanvas2D = () => {
  const context2DMap = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()
  const webglMap = new WeakMap<HTMLCanvasElement, WebGL2RenderingContext>()

  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    contextId: string,
  ) {
    if (contextId === '2d') {
      let ctx = context2DMap.get(this)
      if (!ctx) {
        ctx = {
          fillText: vi.fn<CanvasRenderingContext2D['fillText']>(),
          clearRect: vi.fn<CanvasRenderingContext2D['clearRect']>(),
          save: vi.fn<CanvasRenderingContext2D['save']>(),
          restore: vi.fn<CanvasRenderingContext2D['restore']>(),
          scale: vi.fn<CanvasRenderingContext2D['scale']>(),
          measureText: vi.fn<CanvasRenderingContext2D['measureText']>(
            () =>
              ({
                width: 10,
              }) as TextMetrics,
          ),
        } as unknown as CanvasRenderingContext2D
        context2DMap.set(this, ctx)
      }
      return ctx
    }

    if (contextId === 'webgl' || contextId === 'webgl2') {
      let glProxy = webglMap.get(this)
      if (!glProxy) {
        const baseGl: Record<string, unknown> = {
          VERSION: 7938,
          SHADING_LANGUAGE_VERSION: 35724,
          VENDOR: 7936,
          RENDERER: 7937,
          MAX_TEXTURE_SIZE: 3379,
          MAX_CUBE_MAP_TEXTURE_SIZE: 34076,
          MAX_VERTEX_ATTRIBS: 34921,
          MAX_TEXTURE_IMAGE_UNITS: 34930,
          MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661,
          MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
          MAX_VERTEX_UNIFORM_VECTORS: 36347,
          MAX_FRAGMENT_UNIFORM_VECTORS: 36348,
          MAX_VARYING_VECTORS: 36349,
          MAX_SAMPLES: 36183,
          SAMPLE_BUFFERS: 34136,
          SAMPLES: 34137,
          DEPTH_BUFFER_BIT: 256,
          STENCIL_BUFFER_BIT: 1024,
          COLOR_BUFFER_BIT: 16384,
          TEXTURE_2D: 3553,
          TEXTURE_CUBE_MAP: 34067,
          TEXTURE_2D_ARRAY: 35866,
          TEXTURE_3D: 32879,
          TEXTURE_CUBE_MAP_POSITIVE_X: 34069,
          TEXTURE_MIN_FILTER: 10241,
          TEXTURE_MAG_FILTER: 10240,
          NEAREST: 9728,
          RGBA: 6408,
          RGBA8: 32856,
          UNSIGNED_BYTE: 5121,
          FLOAT: 5126,
          TRIANGLES: 4,
          LINES: 1,
          getContextAttributes: () => ({
            alpha: true,
            antialias: true,
            depth: true,
            stencil: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: false,
          }),
          getExtension: () => null,
          getParameter: (param: number | undefined) => {
            if (param === undefined || param === 7938) return 'WebGL 2.0'
            if (param === 35724) return 'WebGL GLSL ES 3.00'
            if (param === 7936) return 'WebKit'
            if (param === 7937) return 'WebKit WebGL'
            if (param === 3379) return 16384
            if (param === 34076) return 16384
            if (param === 34921) return 16
            if (param === 34930) return 16
            if (param === 35661) return 32
            if (param === 35660) return 16
            if (param === 36347) return 1024
            if (param === 36348) return 1024
            if (param === 36349) return 8
            if (param === 36183) return 4
            return 0
          },
          getShaderPrecisionFormat: () => ({
            rangeMin: 127,
            rangeMax: 127,
            precision: 23,
          }),
          ACTIVE_UNIFORMS: 35718,
          ACTIVE_ATTRIBUTES: 35721,
          getProgramParameter: (_program: unknown, param: number) => {
            if (param === 35718 || param === 35721 || param === 1) return 0
            return true
          },
          getActiveUniform: () => ({ name: 'dummyUniform', size: 1, type: 5126 }),
          getActiveAttrib: () => ({ name: 'dummyAttrib', size: 1, type: 5126 }),
          checkFramebufferStatus: () => 36053,
          getUniformLocation: () => ({}),
          getAttribLocation: () => 0,
        }

        const fallbackFunctions = new Map<string, (...args: unknown[]) => unknown>()

        glProxy = new Proxy(baseGl, {
          get(target, prop: string) {
            if (prop in target) {
              return target[prop]
            }
            if (typeof prop === 'string' && prop === prop.toUpperCase() && prop.length > 2) {
              return 1
            }
            if (!fallbackFunctions.has(prop)) {
              fallbackFunctions.set(
                prop,
                vi.fn(() => 0),
              )
            }
            return fallbackFunctions.get(prop)
          },
        }) as unknown as WebGL2RenderingContext

        webglMap.set(this, glProxy)
      }
      return glProxy
    }

    return null
  })
}
