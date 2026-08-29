import { expect, test } from "bun:test"
import { cellWidth } from "../../lib/text.ts"
import {
  cardAgentLine,
  cardInnerWidth,
  cardStatusView,
  cardTitleLine,
} from "./card.tsx"

const project = "/Users/matheusbbarni/projects/herdr-tasks"

test("cardStatusView keeps starting… during launch and does not mix in live status", () => {
  expect(
    cardStatusView({ launching: true, lane: "in_progress", agentStatus: "working" }),
  ).toEqual({ label: "starting…", tone: "warn" })
})

test("cardStatusView maps lane and live agent state", () => {
  expect(cardStatusView({ launching: false, lane: "backlog" })).toEqual({
    label: "idle",
    tone: "muted",
  })
  expect(cardStatusView({ launching: false, lane: "in_progress" })).toEqual({
    label: "in_progress",
    tone: "warn",
  })
  expect(
    cardStatusView({ launching: false, lane: "in_progress", agentStatus: "working" }),
  ).toEqual({ label: "working", tone: "accent" })
  expect(
    cardStatusView({ launching: false, lane: "in_progress", agentStatus: "idle" }),
  ).toEqual({ label: "idle", tone: "muted" })
  expect(
    cardStatusView({ launching: false, lane: "in_progress", agentStatus: "blocked" }),
  ).toEqual({ label: "? blocked", tone: "warn" })
  expect(cardStatusView({ launching: false, lane: "done" })).toEqual({
    label: "✓ done",
    tone: "ok",
  })
  expect(
    cardStatusView({ launching: false, lane: "in_progress", agentStatus: "gone" }),
  ).toEqual({ label: "gone", tone: "muted" })
})

test("cardAgentLine drops the default project and keeps a different basename", () => {
  expect(cardAgentLine({ agent: "pi", project, defaultProject: project })).toBe("pi")
  expect(
    cardAgentLine({
      agent: "pi",
      project: "/tmp/other",
      defaultProject: project,
    }),
  ).toBe("pi  other")
})

test("card title and status lines truncate by cell width at 80×24 three-column and 60-col floor", () => {
  const title = cardTitleLine("dev-14", "Show Herdr agent status", cardInnerWidth(26, false))
  expect(title.startsWith("dev-14")).toBe(true)
  expect(title).not.toContain("\n")
  expect(cellWidth(title)).toBeLessThanOrEqual(cardInnerWidth(26, false))

  const wide = cardTitleLine("dev-14", "Show Herdr agent status", cardInnerWidth(60, false))
  expect(wide).toContain("Show Herdr agent status")
  expect(cellWidth(wide)).toBeLessThanOrEqual(cardInnerWidth(60, false))
})
