import { expect, test } from "bun:test"
import { splitColumnWidths } from "./board.tsx"
import { columnHeading } from "./column.tsx"

test("splitColumnWidths fills the row and spreads the remainder left", () => {
  expect(splitColumnWidths(80, 3)).toEqual([27, 27, 26])
  expect(splitColumnWidths(80, 4)).toEqual([20, 20, 20, 20])
  expect(splitColumnWidths(60, 1)).toEqual([60])
  expect(splitColumnWidths(79, 3)).toEqual([27, 26, 26])
})

test("columnHeading is uppercase name · count", () => {
  expect(columnHeading("backlog", 5)).toBe("BACKLOG · 5")
  expect(columnHeading("in_progress", 1)).toBe("IN PROGRESS · 1")
  expect(columnHeading("review", 2)).toBe("REVIEW · 2")
  expect(columnHeading("done", 0)).toBe("DONE · 0")
})

test("columnHeading shows shown/total when a filter is active", () => {
  expect(columnHeading("backlog", 2, 5)).toBe("BACKLOG · 2/5")
  expect(columnHeading("in_progress", 0, 3)).toBe("IN PROGRESS · 0/3")
})
