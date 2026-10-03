import { describe, expect, it } from 'vitest'
import { chooseGridStep } from '../grid-step'

describe('chooseGridStep', () => {
  it.each([
    [0.01, 0.01],
    [0.02, 0.02],
    [0.05, 0.05],
    [0.1, 0.1],
    [0.2, 0.2],
    [0.5, 0.5],
    [1, 1],
    [2, 2],
    [5, 5],
    [10, 10],
    [20, 20],
    [50, 50],
    [100, 100],
  ])('matches canonical steps for %d -> %d', (input, expected) => {
    expect(chooseGridStep(input)).toBe(expected)
  })

  it('selects appropriate steps for intermediate values', () => {
    expect(chooseGridStep(0.012)).toBe(0.01)
    expect(chooseGridStep(0.018)).toBe(0.02)
    expect(chooseGridStep(0.045)).toBe(0.05)
    expect(chooseGridStep(0.75)).toBe(1)
    expect(chooseGridStep(1.3)).toBe(1)
    expect(chooseGridStep(1.8)).toBe(2)
    expect(chooseGridStep(3.5)).toBe(5)
    expect(chooseGridStep(8.2)).toBe(10)
    expect(chooseGridStep(35)).toBe(50)
    expect(chooseGridStep(85)).toBe(100)
    expect(chooseGridStep(450)).toBe(500)
  })

  it('handles edge cases gracefully', () => {
    expect(chooseGridStep(0)).toBe(1)
    expect(chooseGridStep(-5)).toBe(1)
    expect(chooseGridStep(NaN)).toBe(1)
    expect(chooseGridStep(Infinity)).toBe(1)
  })
})
