/**
 * Chooses an adaptive grid step from the sequence 1 / 2 / 5 × 10^n.
 * Pure function with constant time complexity and no allocations.
 */
export const chooseGridStep = (rawStep: number): number => {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1
  }

  const exponent = Math.floor(Math.log10(rawStep))
  const base = Math.pow(10, exponent)
  const ratio = rawStep / base

  let multiplier = 1
  // Geometric means: sqrt(2) ~ 1.4142, sqrt(10) ~ 3.1623, sqrt(50) ~ 7.0711
  if (ratio < 1.4142135623730951) {
    multiplier = 1
  } else if (ratio < 3.1622776601683795) {
    multiplier = 2
  } else if (ratio < 7.0710678118654755) {
    multiplier = 5
  } else {
    multiplier = 10
  }

  const step = multiplier * base
  return parseFloat(step.toPrecision(12))
}
