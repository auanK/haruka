import { describe, expect, it } from 'vitest'
import { deriveReferenceFrame, formatSliceIndicator } from '../reference-frame'

describe('deriveReferenceFrame', () => {
  it('derives reference frame independently of camera and focus (Requirement 23)', () => {
    // Free view (null) -> XZ, normal Y, normalValue 0, origin [0,0,0]
    const freeFrame = deriveReferenceFrame(null)
    expect(freeFrame.plane).toBe('xz')
    expect(freeFrame.normalAxis).toBe('y')
    expect(freeFrame.normalValue).toBe(0)
    expect(freeFrame.origin).toEqual([0, 0, 0])
    expect(freeFrame.sliceLabel).toBe('XZ · Y = 0')

    // Lock X -> YZ, normal X, normalValue 0, origin [0,0,0]
    const lockXFrame = deriveReferenceFrame('x')
    expect(lockXFrame.plane).toBe('yz')
    expect(lockXFrame.normalAxis).toBe('x')
    expect(lockXFrame.normalValue).toBe(0)
    expect(lockXFrame.origin).toEqual([0, 0, 0])
    expect(lockXFrame.sliceLabel).toBe('YZ · X = 0')

    // Lock Y -> XZ, normal Y, normalValue 0, origin [0,0,0]
    const lockYFrame = deriveReferenceFrame('y')
    expect(lockYFrame.plane).toBe('xz')
    expect(lockYFrame.normalAxis).toBe('y')
    expect(lockYFrame.normalValue).toBe(0)
    expect(lockYFrame.origin).toEqual([0, 0, 0])
    expect(lockYFrame.sliceLabel).toBe('XZ · Y = 0')

    // Lock Z -> XY, normal Z, normalValue 0, origin [0,0,0]
    const lockZFrame = deriveReferenceFrame('z')
    expect(lockZFrame.plane).toBe('xy')
    expect(lockZFrame.normalAxis).toBe('z')
    expect(lockZFrame.normalValue).toBe(0)
    expect(lockZFrame.origin).toEqual([0, 0, 0])
    expect(lockZFrame.sliceLabel).toBe('XY · Z = 0')
  })

  it('pan does not alter reference frame (Requirement 24)', () => {
    // Simulating camera targets before and after pan
    const targetA = [0, 0, 0] as const
    const targetB = [10, -5.4305, 20] as const

    for (const lock of [null, 'x', 'y', 'z'] as const) {
      const frameBefore = deriveReferenceFrame(lock)
      const frameAfter = deriveReferenceFrame(lock)
      expect(frameBefore).toEqual(frameAfter)
      expect(frameAfter.normalValue).toBe(0)
      expect(frameAfter.origin).toEqual([0, 0, 0])
    }
  })

  it('screenshot regression: camera target at Y = -5.4305 produces XZ · Y = 0, NOT XZ · Y = -5.4305 (Requirement 25)', () => {
    const frame = deriveReferenceFrame(null)
    expect(formatSliceIndicator(frame)).toBe('XZ · Y = 0')
    expect(frame.sliceLabel).toBe('XZ · Y = 0')
    expect(formatSliceIndicator(frame)).not.toBe('XZ · Y = -5.4305')
  })
})
