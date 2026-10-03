// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderScheduler } from '../render-scheduler'

describe('createRenderScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('coalesces multiple requestRender calls into a single animation frame', () => {
    const renderFrame = vi.fn<() => void>()
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')

    const scheduler = createRenderScheduler(renderFrame)

    scheduler.requestRender()
    scheduler.requestRender()
    scheduler.requestRender()

    expect(rafSpy).toHaveBeenCalledTimes(1)
    expect(renderFrame).not.toHaveBeenCalled()

    // Trigger RAF
    vi.runAllTimers()

    expect(renderFrame).toHaveBeenCalledTimes(1)
  })

  it('remains idle after frame execution without scheduling perpetual frames', () => {
    const renderFrame = vi.fn<() => void>()
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')

    const scheduler = createRenderScheduler(renderFrame)
    scheduler.requestRender()
    vi.runAllTimers()

    expect(renderFrame).toHaveBeenCalledTimes(1)
    expect(rafSpy).toHaveBeenCalledTimes(1)

    // Advance time while idle
    vi.advanceTimersByTime(5000)

    // No new frame or RAF request should have occurred
    expect(renderFrame).toHaveBeenCalledTimes(1)
    expect(rafSpy).toHaveBeenCalledTimes(1)
  })

  it('allows requesting a new frame after the previous frame has completed', () => {
    const renderFrame = vi.fn<() => void>()
    const scheduler = createRenderScheduler(renderFrame)

    scheduler.requestRender()
    vi.runAllTimers()
    expect(renderFrame).toHaveBeenCalledTimes(1)

    scheduler.requestRender()
    vi.runAllTimers()
    expect(renderFrame).toHaveBeenCalledTimes(2)
  })

  it('cancels pending RAF on dispose and ignores subsequent requestRender calls', () => {
    const renderFrame = vi.fn<() => void>()
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')

    const scheduler = createRenderScheduler(renderFrame)
    scheduler.requestRender()

    expect(cancelSpy).not.toHaveBeenCalled()

    scheduler.dispose()

    expect(cancelSpy).toHaveBeenCalledTimes(1)

    // Trigger any timers
    vi.runAllTimers()
    expect(renderFrame).not.toHaveBeenCalled()

    // Subsequent requests after dispose do nothing
    scheduler.requestRender()
    expect(renderFrame).not.toHaveBeenCalled()
  })
})
