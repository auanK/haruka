// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { deriveDestinationIndex } from '../transform-stack-dnd'
import * as dnd from '../transform-stack-dnd'

describe('transformation stack insertion slots', () => {
  it.each([
    [0, 3, 2],
    [3, 1, 1],
    [1, 1, 1],
    [1, 2, 1],
    [2, 0, 0],
    [0, 4, 3],
  ])('converts source %s and slot %s to final index %s', (source, slot, destination) => {
    expect(deriveDestinationIndex(source!, slot!, 4)).toBe(destination)
  })

  it.each([
    [-1, 1, 4],
    [4, 1, 4],
    [NaN, 1, 4],
    [0.5, 1, 4],
    [Infinity, 1, 4],
    [1, -1, 4],
    [1, 5, 4],
    [1, NaN, 4],
    [1, Infinity, 4],
    [1, 0.5, 4],
    [0, 0, 0],
    [0, 0, -1],
    [0, 0, 2.5],
    [0, 0, NaN],
    [0, 0, Infinity],
  ])('rejects invalid source %s, slot %s or length %s', (source, slot, length) => {
    expect(deriveDestinationIndex(source!, slot!, length!)).toBeUndefined()
  })
})

describe('ergonomic insertion slots', () => {
  const cards = [
    { top: 0, bottom: 100 },
    { top: 110, bottom: 210 },
    { top: 220, bottom: 320 },
  ]

  it.each([
    [-30, 0],
    [0, 0],
    [105, 1],
    [215, 2],
    [320, 3],
    [400, 3],
  ])('selects slot %s near the requested anchors and extremes', (pointer, expected) => {
    expect(dnd.deriveRemainingInsertionSlot(cards, pointer!, 1)).toBe(expected)
  })

  it.each([0, 1, 2, 3])(
    'maps every remaining slot for source %s into the original slot model',
    (source) => {
      for (let remainingSlot = 0; remainingSlot < 4; remainingSlot++) {
        const originalSlot = dnd.mapRemainingSlotToOriginalSlot(source, remainingSlot, 4)
        expect(originalSlot).toBe(remainingSlot <= source ? remainingSlot : remainingSlot + 1)
        expect(deriveDestinationIndex(source, originalSlot!, 4)).toBe(remainingSlot)
      }
    },
  )

  it.each([
    [-1, 0, 3],
    [3, 0, 3],
    [0, -1, 3],
    [0, 3, 3],
    [0, NaN, 3],
    [0, 0.5, 3],
    [0, Infinity, 3],
    [0, 0, 0],
  ])('rejects invalid source %s, remaining slot %s or length %s', (source, slot, length) => {
    expect(dnd.mapRemainingSlotToOriginalSlot(source!, slot!, length!)).toBeUndefined()
  })

  it('uses only the remaining geometry to move B after C shortly after entering C', () => {
    const remainingSlot = dnd.deriveRemainingInsertionSlot(
      [
        { top: 0, bottom: 100 },
        { top: 210, bottom: 310 },
      ],
      240,
      1,
    )
    const originalSlot = dnd.mapRemainingSlotToOriginalSlot(1, remainingSlot!, 3)
    expect(deriveDestinationIndex(1, originalSlot!, 3)).toBe(2)
  })

  it('reorders downward before reaching the adjacent midpoint, including hysteresis', () => {
    const remainingSlot = dnd.deriveRemainingInsertionSlot([{ top: 100, bottom: 200 }], 130, 0, 0)
    expect(
      deriveDestinationIndex(0, dnd.mapRemainingSlotToOriginalSlot(0, remainingSlot!, 2)!, 2),
    ).toBe(1)
  })

  it('reorders upward before reaching the adjacent midpoint, including hysteresis', () => {
    const remainingSlot = dnd.deriveRemainingInsertionSlot([{ top: 0, bottom: 100 }], 70, 1, 1)
    expect(
      deriveDestinationIndex(1, dnd.mapRemainingSlotToOriginalSlot(1, remainingSlot!, 2)!, 2),
    ).toBe(0)
  })

  it('keeps the current slot through small spatial oscillations and changes after crossing the margin', () => {
    let slot = 0
    const slots = [100, 103, 101, 104, 103, 101, 104, 95].map((pointer) => {
      slot = dnd.deriveRemainingInsertionSlot([{ top: 75, bottom: 175 }], pointer, 0, slot)!
      return slot
    })
    expect(slots).toEqual([0, 0, 0, 1, 1, 1, 1, 0])
  })

  it('has only a no-op slot when the source is the sole card', () => {
    expect(dnd.deriveRemainingInsertionSlot([], 100, 0)).toBe(0)
    expect(dnd.mapRemainingSlotToOriginalSlot(0, 0, 1)).toBe(0)
  })

  it.each([
    [cards, NaN, 1],
    [cards, Infinity, 1],
    [cards, 100, -1],
    [cards, 100, 4],
    [[{ top: 0, bottom: NaN }], 100, 0],
    [[{ top: 100, bottom: 0 }], 100, 0],
    [
      [
        { top: 0, bottom: 100 },
        { top: 90, bottom: 200 },
      ],
      100,
      0,
    ],
  ])('rejects invalid geometry or pointer/source data %#', (geometry, pointer, source) => {
    expect(dnd.deriveRemainingInsertionSlot(geometry, pointer, source)).toBeUndefined()
  })
})

describe('interactive drag targets', () => {
  it.each([
    'input',
    'select',
    'button',
    'textarea',
    'div[contenteditable]',
    'a[href]',
    'label[for]',
    'span[data-no-drag]',
  ])('excludes %s and its descendants', (selector) => {
    const [tag, attribute] = selector.replace(']', '').split('[')
    const control = document.createElement(tag!)
    if (attribute) control.setAttribute(attribute, '')
    const child = document.createElement('span')
    control.append(child)
    expect(dnd.isInteractiveDragTarget(control)).toBe(true)
    expect(dnd.isInteractiveDragTarget(child)).toBe(true)
  })

  it.each(['h2', 'td', 'article', 'span'])('permits the non-interactive %s surface', (tag) => {
    expect(dnd.isInteractiveDragTarget(document.createElement(tag))).toBe(false)
  })

  it('accepts a missing target without throwing', () => {
    expect(dnd.isInteractiveDragTarget(null)).toBe(false)
  })
})
