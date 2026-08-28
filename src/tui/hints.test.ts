import { expect, test } from "bun:test"
import { HINTS_NARROW, HINTS_WIDE, fitHints } from "./hints.ts"

test("fitHints keeps the full wide bar at 80 columns", () => {
  expect(fitHints(HINTS_WIDE, 80).map((hint) => hint.action)).toEqual([
    "select",
    "move",
    "new",
    "edit",
    "preview",
    "help",
    "quit",
  ])
})

test("fitHints drops help then preview on a 60-column floor", () => {
  expect(fitHints(HINTS_WIDE, 60).map((hint) => hint.action)).toEqual([
    "select",
    "move",
    "new",
    "edit",
    "quit",
  ])
  expect(fitHints(HINTS_NARROW, 60).map((hint) => hint.action)).toEqual([
    "lane",
    "card",
    "select",
    "new",
    "quit",
  ])
})
