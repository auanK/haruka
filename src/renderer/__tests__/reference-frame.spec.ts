import { describe, expect, it } from 'vitest'
import { deriveReferenceFrame, formatSliceIndicator } from '../reference-frame'

describe('deriveReferenceFrame', () => {
  it('derives reference frame for free view and axis locks (Requirement 44)', () => {
    const focus = [10, 2000, -30] as const

    // Free view (lock null) -> XZ, normal Y, normalValue 2000
    const freeFrame = deriveReferenceFrame({ lock: null, focus })
    expect(freeFrame.plane).toBe('xz')
    expect(freeFrame.normalAxis).toBe('y')
    expect(freeFrame.normalValue).toBe(2000)
    expect(freeFrame.origin).toEqual([10, 2000, -30])

    // Lock X -> YZ, normal X, normalValue 10
    const lockXFrame = deriveReferenceFrame({ lock: 'x', focus })
    expect(lockXFrame.plane).toBe('yz')
    expect(lockXFrame.normalAxis).toBe('x')
    expect(lockXFrame.normalValue).toBe(10)
    expect(lockXFrame.origin).toEqual([10, 2000, -30])

    // Lock Y -> XZ, normal Y, normalValue 2000
    const lockYFrame = deriveReferenceFrame({ lock: 'y', focus })
    expect(lockYFrame.plane).toBe('xz')
    expect(lockYFrame.normalAxis).toBe('y')
    expect(lockYFrame.normalValue).toBe(2000)
    expect(lockYFrame.origin).toEqual([10, 2000, -30])

    // Lock Z -> XY, normal Z, normalValue -30
    const lockZFrame = deriveReferenceFrame({ lock: 'z', focus })
    expect(lockZFrame.plane).toBe('xy')
    expect(lockZFrame.normalAxis).toBe('z')
    expect(lockZFrame.normalValue).toBe(-30)
    expect(lockZFrame.origin).toEqual([10, 2000, -30])
  })

  it('handles object-based focus vectors { x, y, z }', () => {
    const frame = deriveReferenceFrame({
      lock: 'z',
      focus: { x: 50, y: -20, z: 1500 },
    })
    expect(frame.plane).toBe('xy')
    expect(frame.normalAxis).toBe('z')
    expect(frame.normalValue).toBe(1500)
    expect(frame.origin).toEqual([50, -20, 1500])
  })

  it('handles extreme coordinates stably without unbounded operations (Requirement 49)', () => {
    for (const mag of [1e3, 1e6, 1e9]) {
      const frame = deriveReferenceFrame({
        lock: 'x',
        focus: [mag, -mag, mag],
      })
      expect(Number.isFinite(frame.normalValue)).toBe(true)
      expect(frame.normalValue).toBe(mag)
      expect(frame.origin.every((v) => Number.isFinite(v))).toBe(true)
    }
  })

  it('formats slice indicator semantically (Requirement 58)', () => {
    const frame = deriveReferenceFrame({
      lock: 'z',
      focus: [100, 200, 2000],
    })
    expect(formatSliceIndicator(frame)).toBe('XY · Z = 2000')

    const frameY = deriveReferenceFrame({
      lock: 'y',
      focus: [0, 2000, 0],
    })
    expect(formatSliceIndicator(frameY)).toBe('XZ · Y = 2000')

    const frameX = deriveReferenceFrame({
      lock: 'x',
      focus: [1500, 0, 0],
    })
    expect(formatSliceIndicator(frameX)).toBe('YZ · X = 1500')
  })
})
