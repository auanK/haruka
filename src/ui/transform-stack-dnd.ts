/** Converts an insertion slot in the original list to a final index after removal. */
export const deriveDestinationIndex = (
  sourceIndex: number,
  insertionSlot: number,
  length: number,
): number | undefined => {
  if (
    !Number.isInteger(length) ||
    length <= 0 ||
    !Number.isInteger(sourceIndex) ||
    sourceIndex < 0 ||
    sourceIndex >= length ||
    !Number.isInteger(insertionSlot) ||
    insertionSlot < 0 ||
    insertionSlot > length
  )
    return undefined
  return sourceIndex < insertionSlot ? insertionSlot - 1 : insertionSlot
}

export const isInteractiveDragTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('input, select, button, textarea, [contenteditable], a, label, [data-no-drag]') !==
    null

export type VerticalInterval = { readonly top: number; readonly bottom: number }

/** The source is absent from cards; early directional thresholds avoid crossing half a neighbor. */
export const deriveRemainingInsertionSlot = (
  cards: readonly VerticalInterval[],
  pointerY: number,
  sourceIndex: number,
  currentSlot?: number,
): number | undefined => {
  if (
    !Number.isFinite(pointerY) ||
    deriveDestinationIndex(sourceIndex, 0, cards.length + 1) === undefined ||
    (currentSlot !== undefined &&
      (!Number.isInteger(currentSlot) || currentSlot < 0 || currentSlot > cards.length)) ||
    cards.some(
      (card, index) =>
        !Number.isFinite(card.top) ||
        !Number.isFinite(card.bottom) ||
        card.bottom <= card.top ||
        (index > 0 && card.top < cards[index - 1]!.bottom),
    )
  )
    return undefined

  const boundaries = cards.map(
    (card, index) => card.top + (card.bottom - card.top) * (index < sourceIndex ? 0.75 : 0.25),
  )
  const match = boundaries.findIndex((boundary) => pointerY < boundary)
  const candidate = match === -1 ? cards.length : match
  if (currentSlot !== undefined) {
    if (candidate > currentSlot && pointerY < boundaries[currentSlot]! + 4) return currentSlot
    if (candidate < currentSlot && pointerY > boundaries[currentSlot - 1]! - 4) return currentSlot
  }
  return candidate
}

/** A remaining slot is a final index; translate it back to the original list's slot model. */
export const mapRemainingSlotToOriginalSlot = (
  sourceIndex: number,
  remainingSlot: number,
  length: number,
): number | undefined => {
  if (
    deriveDestinationIndex(sourceIndex, remainingSlot, length) === undefined ||
    remainingSlot === length
  )
    return undefined
  return remainingSlot <= sourceIndex ? remainingSlot : remainingSlot + 1
}
