export type RenderScheduler = {
  readonly requestRender: () => void
  readonly dispose: () => void
}

/**
 * Creates a render scheduler that coalesces multiple invalidations into a single
 * requestAnimationFrame, ensuring no continuous rendering loop exists in idle state.
 */
export const createRenderScheduler = (renderFrame: () => void): RenderScheduler => {
  let pendingRafId: number | null = null
  let disposed = false

  const onFrame = () => {
    pendingRafId = null
    if (disposed) return
    renderFrame()
  }

  return {
    requestRender: () => {
      if (disposed || pendingRafId !== null) return
      pendingRafId = requestAnimationFrame(onFrame)
    },
    dispose: () => {
      disposed = true
      if (pendingRafId !== null) {
        cancelAnimationFrame(pendingRafId)
        pendingRafId = null
      }
    },
  }
}
