import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_DRAWING_BUFFER_PIXELS,
  DEFAULT_MAX_WEBGL_DPR,
  resolveRenderPixelRatio,
} from '../pixel-ratio'

describe('resolveRenderPixelRatio', () => {
  it('allows quality DPR for standard 1080p desktop viewport', () => {
    // 1200 x 800 viewport with devicePixelRatio 2
    const dpr = resolveRenderPixelRatio({
      cssWidth: 1200,
      cssHeight: 800,
      devicePixelRatio: 2,
      maxDpr: DEFAULT_MAX_WEBGL_DPR, // 1.5
    })

    expect(dpr).toBe(1.5)
    const totalPixels = 1200 * dpr * (800 * dpr)
    expect(totalPixels).toBeLessThanOrEqual(DEFAULT_MAX_DRAWING_BUFFER_PIXELS)
  })

  it('respects configured maxDpr cap', () => {
    const dpr = resolveRenderPixelRatio({
      cssWidth: 800,
      cssHeight: 600,
      devicePixelRatio: 3,
      maxDpr: 1.25,
    })

    expect(dpr).toBe(1.25)
  })

  it('clamps devicePixelRatio to devicePixelRatio if lower than maxDpr', () => {
    const dpr = resolveRenderPixelRatio({
      cssWidth: 800,
      cssHeight: 600,
      devicePixelRatio: 1.0,
      maxDpr: 1.5,
    })

    expect(dpr).toBe(1.0)
  })

  it('dynamically reduces DPR on gigantic / 4K / ultrawide viewports to satisfy pixel budget', () => {
    // 3840 x 2160 (4K) with budget 4,194,304 pixels (~2048x2048)
    const budget = 4_000_000
    const dpr = resolveRenderPixelRatio({
      cssWidth: 3840,
      cssHeight: 2160,
      devicePixelRatio: 2,
      maxDpr: 1.5,
      maxDrawingBufferPixels: budget,
    })

    expect(dpr).toBeLessThan(1.0)
    expect(dpr).toBeGreaterThan(0)
    const totalPixels = Math.floor(3840 * dpr) * Math.floor(2160 * dpr)
    expect(totalPixels).toBeLessThanOrEqual(budget)
  })

  it('handles invalid or zero dimensions without producing NaN or zero', () => {
    for (const [w, h] of [
      [0, 0],
      [-100, 500],
      [500, -100],
      [Number.NaN, 500],
    ]) {
      const dpr = resolveRenderPixelRatio({
        cssWidth: w!,
        cssHeight: h!,
        devicePixelRatio: 2,
      })

      expect(dpr).toBeGreaterThan(0)
      expect(Number.isFinite(dpr)).toBe(true)
    }
  })

  it('provides sensible WebGL DPR and pixel budget defaults', () => {
    expect(DEFAULT_MAX_WEBGL_DPR).toBe(1.5)
    expect(DEFAULT_MAX_DRAWING_BUFFER_PIXELS).toBeGreaterThanOrEqual(2048 * 2048)
  })
})
