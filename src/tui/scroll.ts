import type { ScrollBoxRenderable } from "@opentui/core"

/** Border + 3 content rows. Keep in sync with `Card`. */
export const CARD_HEIGHT = 5
/** Cards sit flush; borders already separate them. Keep in sync with the lane stack. */
export const CARD_GAP = 0

export function cardRenderableId(taskId: string): string {
  return `card:${taskId}`
}

export function scrollOffsetToReveal(opts: {
  index: number
  itemHeight: number
  gap: number
  viewportHeight: number
  currentOffset: number
}): number {
  const current = Math.max(0, opts.currentOffset)
  if (opts.index < 0 || opts.viewportHeight <= 0 || opts.itemHeight <= 0) return current
  const stride = opts.itemHeight + Math.max(0, opts.gap)
  const top = opts.index * stride
  const bottom = top + opts.itemHeight
  if (top < current) return top
  if (bottom > current + opts.viewportHeight) {
    return Math.max(0, bottom - opts.viewportHeight)
  }
  return current
}

export function revealTaskInLane(
  scrollbox: ScrollBoxRenderable | null,
  taskId: string | null,
  index: number,
): boolean {
  if (!scrollbox || !taskId || index < 0) return false
  const viewportHeight = scrollbox.viewport.height
  if (viewportHeight <= 0) return false

  const next = scrollOffsetToReveal({
    index,
    itemHeight: CARD_HEIGHT,
    gap: CARD_GAP,
    viewportHeight,
    currentOffset: scrollbox.scrollTop,
  })
  if (next !== scrollbox.scrollTop) scrollbox.scrollTo(next)

  const childId = cardRenderableId(taskId)
  const child = scrollbox.content.findDescendantById(childId)
  if (child && child.height > 0) {
    scrollbox.scrollChildIntoView(childId)
  }
  return true
}
