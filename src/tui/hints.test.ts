import { expect, test } from "bun:test"
import type { Task } from "../lib/types.ts"
import { HINTS_NARROW, HINTS_WIDE, fitHints, hintsForTask } from "./hints.ts"

const doneWithLayout: Task = {
  id: "dev-1",
  title: "X",
  status: "done",
  order: 0,
  type: "feat",
  agent: "claude",
  effort: "",
  project: "/repo",
  created: "",
  updated: "",
  herdr: { workspace_id: "w1", pane_id: "w1:p1", agent_name: null },
  blockers: [],
  worktree: false,
  body: "",
  filePath: "/repo/.herdr-tasks/tasks/dev-1.md",
}

test("fitHints keeps primary actions at 80 columns", () => {
  expect(fitHints(HINTS_WIDE, 80).map((hint) => hint.action)).toEqual([
    "select",
    "move",
    "new",
    "edit",
    "set",
    "quit",
  ])
})

test("fitHints drops help then preview then open on a 60-column floor", () => {
  expect(fitHints(HINTS_WIDE, 60).map((hint) => hint.action)).toEqual([
    "select",
    "move",
    "new",
    "set",
    "quit",
  ])
  expect(fitHints(HINTS_NARROW, 60).map((hint) => hint.action)).toEqual([
    "lane",
    "select",
    "new",
    "set",
    "quit",
  ])
})

test("hintsForTask shows close instead of open on a done card with a layout", () => {
  expect(hintsForTask(HINTS_WIDE, null).map((hint) => hint.action)).toContain("open")
  expect(hintsForTask(HINTS_WIDE, doneWithLayout).map((hint) => hint.action)).toEqual([
    "select",
    "move",
    "new",
    "filter",
    "preview",
    "help",
    "close",
    "set",
    "quit",
  ])
  expect(
    hintsForTask(HINTS_WIDE, { ...doneWithLayout, herdr: { workspace_id: null, pane_id: null, agent_name: null } }).map(
      (hint) => hint.action,
    ),
  ).toContain("open")
  expect(fitHints(hintsForTask(HINTS_WIDE, doneWithLayout), 80).map((hint) => hint.action)).toEqual([
    "select",
    "move",
    "new",
    "close",
    "set",
    "quit",
  ])
  expect(fitHints(hintsForTask(HINTS_WIDE, doneWithLayout), 60).map((hint) => hint.action)).toEqual([
    "select",
    "move",
    "new",
    "set",
    "quit",
  ])
})

test("hintsForTask shows order when a card is selected", () => {
  expect(hintsForTask(HINTS_WIDE, null, true).map((hint) => hint.action)).toEqual([
    "select",
    "move",
    "order",
    "new",
    "filter",
    "edit",
    "preview",
    "help",
    "open",
    "set",
    "quit",
  ])
  expect(hintsForTask(HINTS_NARROW, null, true).map((hint) => hint.action)).toEqual([
    "lane",
    "order",
    "select",
    "new",
    "filter",
    "edit",
    "preview",
    "help",
    "open",
    "set",
    "quit",
  ])
  expect(fitHints(hintsForTask(HINTS_WIDE, null, true), 80).map((hint) => hint.action)).toEqual([
    "select",
    "move",
    "order",
    "new",
    "set",
    "quit",
  ])
})

test("hintsForTask hides edit on done cards", () => {
  expect(hintsForTask(HINTS_WIDE, null).map((hint) => hint.action)).toContain("edit")
  expect(
    hintsForTask(HINTS_WIDE, { ...doneWithLayout, status: "backlog" }).map((hint) => hint.action),
  ).toContain("edit")
  expect(hintsForTask(HINTS_WIDE, doneWithLayout).map((hint) => hint.action)).not.toContain("edit")
  expect(
    hintsForTask(HINTS_WIDE, {
      ...doneWithLayout,
      herdr: { workspace_id: null, pane_id: null, agent_name: null },
    }).map((hint) => hint.action),
  ).not.toContain("edit")
})
