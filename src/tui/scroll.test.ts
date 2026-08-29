import { expect, test } from "bun:test"
import { CARD_GAP, CARD_HEIGHT, cardRenderableId, scrollOffsetToReveal } from "./scroll.ts"

test("cardRenderableId namespaces the task id", () => {
  expect(cardRenderableId("dev-19")).toBe("card:dev-19")
})

test("scrollOffsetToReveal keeps an on-screen item put", () => {
  expect(
    scrollOffsetToReveal({
      index: 1,
      itemHeight: CARD_HEIGHT,
      gap: CARD_GAP,
      viewportHeight: 20,
      currentOffset: 0,
    }),
  ).toBe(0)
})

test("scrollOffsetToReveal scrolls down just enough to show the item", () => {
  // index 5 → top 30, bottom 35; viewport 10 → offset 25
  expect(
    scrollOffsetToReveal({
      index: 5,
      itemHeight: CARD_HEIGHT,
      gap: CARD_GAP,
      viewportHeight: 10,
      currentOffset: 0,
    }),
  ).toBe(25)
})

test("scrollOffsetToReveal scrolls up to the item top", () => {
  expect(
    scrollOffsetToReveal({
      index: 0,
      itemHeight: CARD_HEIGHT,
      gap: CARD_GAP,
      viewportHeight: 8,
      currentOffset: 12,
    }),
  ).toBe(0)
})

test("scrollOffsetToReveal ignores a missing item and an empty viewport", () => {
  expect(
    scrollOffsetToReveal({
      index: -1,
      itemHeight: CARD_HEIGHT,
      gap: CARD_GAP,
      viewportHeight: 8,
      currentOffset: 4,
    }),
  ).toBe(4)
  expect(
    scrollOffsetToReveal({
      index: 3,
      itemHeight: CARD_HEIGHT,
      gap: CARD_GAP,
      viewportHeight: 0,
      currentOffset: 4,
    }),
  ).toBe(4)
})
