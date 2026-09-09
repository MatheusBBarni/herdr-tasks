import { expect, test } from "bun:test"
import { boardRowHeight, chunkLanes, lanesPerRow, MIN_LANE_WIDTH, splitColumnWidths } from "./board.tsx"
import { columnHeading } from "./column.tsx"

test("splitColumnWidths uses a fixed lane width except for a single pane", () => {
  expect(splitColumnWidths(80, 3)).toEqual([20, 20, 20])
  expect(splitColumnWidths(80, 4)).toEqual([20, 20, 20, 20])
  expect(splitColumnWidths(60, 1)).toEqual([60])
  expect(splitColumnWidths(79, 3)).toEqual([20, 20, 20])
  expect(splitColumnWidths(80, 6)).toEqual([20, 20, 20, 20, 20, 20])
  expect(splitColumnWidths(80, 6).every((width) => width === MIN_LANE_WIDTH)).toBe(true)
})

test("lanesPerRow packs fixed-width columns", () => {
  expect(lanesPerRow(80)).toBe(4)
  expect(lanesPerRow(60)).toBe(3)
  expect(lanesPerRow(19)).toBe(1)
})

test("chunkLanes wraps extra lanes onto the next row", () => {
  expect(chunkLanes(["a", "b", "c", "d", "e", "f"], 4)).toEqual([
    ["a", "b", "c", "d"],
    ["e", "f"],
  ])
})


test("boardRowHeight subtracts top bar, hint bar, and toast", () => {
  expect(boardRowHeight(24, false)).toBe(22)
  expect(boardRowHeight(24, true)).toBe(21)
})


test("columnHeading is uppercase name · count", () => {
  expect(columnHeading("backlog", 5)).toBe("BACKLOG · 5")
  expect(columnHeading("in_progress", 1)).toBe("IN PROGRESS · 1")
  expect(columnHeading("review", 2)).toBe("REVIEW · 2")
  expect(columnHeading("done", 0)).toBe("DONE · 0")
  expect(columnHeading("qa", 3, "QA")).toBe("QA · 3")
})

test("columnHeading shows shown/total when a filter is active", () => {
  expect(columnHeading("backlog", 2, undefined, 5)).toBe("BACKLOG · 2/5")
  expect(columnHeading("in_progress", 0, undefined, 3)).toBe("IN PROGRESS · 0/3")
})
