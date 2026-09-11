import { expect, test } from "bun:test"
import { cellWidth } from "../../lib/text.ts"
import {
  cardAgentLine,
  cardHintLine,
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
  expect(cardStatusView({ launching: false, lane: "review" })).toEqual({
    label: "review",
    tone: "accent",
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
  expect(
    cardStatusView({ launching: false, lane: "in_progress", agentStatus: "done" }),
  ).toEqual({ label: "idle", tone: "muted" })
  expect(cardStatusView({ launching: false, lane: "done" })).toEqual({
    label: "✓ done",
    tone: "ok",
  })
  expect(
    cardStatusView({ launching: false, lane: "in_progress", agentStatus: "gone" }),
  ).toEqual({ label: "gone", tone: "muted" })
  expect(cardStatusView({ launching: false, lane: "qa" })).toEqual({
    label: "qa",
    tone: "accent",
  })
  expect(
    cardStatusView({ launching: false, lane: "qa", laneName: "QA" }),
  ).toEqual({ label: "QA", tone: "accent" })
})

test("cardAgentLine puts type before agent and keeps project context", () => {
  expect(cardAgentLine({ type: "feat", agent: "pi", project, defaultProject: project })).toBe(
    "feat  pi",
  )
  expect(
    cardAgentLine({
      type: "fix",
      agent: "pi",
      project: "/tmp/other",
      defaultProject: project,
    }),
  ).toBe("fix  pi  other")
})

test("cardHintLine compactly shows blockers, effort, and worktree", () => {
  expect(cardHintLine({ blockers: ["dev-1", "dev-2"], effort: "high", worktree: true })).toBe(
    "blockers:2  effort:high  wt",
  )
  expect(cardHintLine({ blockers: [], effort: "", worktree: false })).toBe("")
})

test("card title and status lines truncate by cell width at 80×24 four-column and 60-col floor", () => {
  const title = cardTitleLine("dev-14", "Show Herdr agent status", cardInnerWidth(20, false))
  expect(title.startsWith("dev-14")).toBe(true)
  expect(title).not.toContain("\n")
  expect(cellWidth(title)).toBeLessThanOrEqual(cardInnerWidth(20, false))

  const threeCol = cardTitleLine("dev-14", "Show Herdr agent status", cardInnerWidth(26, false))
  expect(threeCol.startsWith("dev-14")).toBe(true)
  expect(threeCol).not.toContain("\n")
  expect(cellWidth(threeCol)).toBeLessThanOrEqual(cardInnerWidth(26, false))

  const wide = cardTitleLine("dev-14", "Show Herdr agent status", cardInnerWidth(60, false))
  expect(wide).toContain("Show Herdr agent status")
  expect(cellWidth(wide)).toBeLessThanOrEqual(cardInnerWidth(60, false))
})
