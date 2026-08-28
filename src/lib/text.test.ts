import { expect, test } from "bun:test"
import { basename, cellWidth, truncateCells } from "./text.ts"

test("truncate by terminal cell width", () => {
  expect(cellWidth("abc")).toBe(3)
  expect(truncateCells("abcdefghij", 5)).toBe("abcd…")
  expect(truncateCells("short", 10)).toBe("short")
})

test("basename", () => {
  expect(basename("/tmp/foo/bar")).toBe("bar")
  expect(basename("bar")).toBe("bar")
})
