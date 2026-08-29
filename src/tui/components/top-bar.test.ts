import { expect, test } from "bun:test"
import { cellWidth } from "../../lib/text.ts"
import { formatTopBar, liveRunningCount } from "./top-bar.tsx"

test("formatTopBar fits brand, running count, board name, and prefix on one row", () => {
  const pieces = formatTopBar({
    width: 80,
    running: 0,
    boardName: "herdr-tasks",
    prefix: "dev",
  })
  const left = pieces.brand + (pieces.showRunning ? pieces.running : "")
  const width =
    cellWidth(left) + pieces.leftPad + cellWidth(pieces.center) + pieces.rightPad + cellWidth(pieces.right)
  expect(width).toBe(80)
  expect(pieces.showRunning).toBe(true)
  expect(pieces.center).toBe("herdr-tasks")
  expect(pieces.right).toBe("dev")
})

test("liveRunningCount ignores gone panes and caps at in-progress tasks", () => {
  expect(
    liveRunningCount({
      launchingIds: new Set(["dev-1"]),
      agentStatuses: new Map([
        ["p1", "working"],
        ["p2", "gone"],
      ]),
      inProgressCount: 2,
    }),
  ).toBe(2)
})
