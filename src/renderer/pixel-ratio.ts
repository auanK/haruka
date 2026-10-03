export const DEFAULT_MAX_WEBGL_DPR = 1.5

// Budget equivalent to 2048 x 2048 (~4.19M pixels)
export const DEFAULT_MAX_DRAWING_BUFFER_PIXELS = 2048 * 2048

export type PixelRatioOptions = {
  readonly cssWidth: number
  readonly cssHeight: number
  readonly devicePixelRatio: number
  readonly maxDpr?: number
  readonly maxDrawingBufferPixels?: number
}

/**
 * Resolves an effective pixel ratio capped by both a maximum DPR
 * and an absolute pixel budget, preventing massive framebuffer allocations
 * on HiDPI / 4K / ultrawide displays while preserving clear didactic visuals.
 */
export const resolveRenderPixelRatio = ({
  cssWidth,
  cssHeight,
  devicePixelRatio,
  maxDpr = DEFAULT_MAX_WEBGL_DPR,
  maxDrawingBufferPixels = DEFAULT_MAX_DRAWING_BUFFER_PIXELS,
}: PixelRatioOptions): number => {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  const initialDpr = Math.min(safeDpr, maxDpr)

  const w = Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : 1
  const h = Number.isFinite(cssHeight) && cssHeight > 0 ? cssHeight : 1

  const requestedPixels = w * initialDpr * (h * initialDpr)

  if (requestedPixels > maxDrawingBufferPixels && maxDrawingBufferPixels > 0) {
    // Budget constrained: scale DPR down to fit exactly within pixel count
    const budgetDpr = Math.sqrt(maxDrawingBufferPixels / (w * h))
    return Math.max(0.25, Math.min(initialDpr, budgetDpr))
  }

  return Math.max(0.25, initialDpr)
}
