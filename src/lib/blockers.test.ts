import { expect, test } from "bun:test"
import {
  assertBlockersValid,
  formatBlockedError,
  hasBlockerCycle,
  normalizeBlockers,
  parseBlockers,
  parseBlockersInput,
  toggleBlocker,
} from "./blockers.ts"
import type { Task } from "./types.ts"

function task(partial: Partial<Task> & Pick<Task, "id" | "status">): Task {
  return {
    title: partial.id,
    type: "feat",
    agent: "claude",
    effort: "",
    project: "/tmp",
    created: "",
    updated: "",
    herdr: { workspace_id: null, pane_id: null, agent_name: null },
    blockers: [],
    body: "",
    filePath: "",
    ...partial,
  }
}

test("parseBlockers accepts a string, list, or empty", () => {
  expect(parseBlockers(undefined)).toEqual([])
  expect(parseBlockers("dev-1")).toEqual(["dev-1"])
  expect(parseBlockers(["dev-1", "dev-2", "dev-1"])).toEqual(["dev-1", "dev-2"])
  expect(parseBlockers([" none ", ""])).toEqual([])
})

test("parseBlockersInput splits comma-separated ids", () => {
  expect(parseBlockersInput("")).toEqual([])
  expect(parseBlockersInput("none")).toEqual([])
  expect(parseBlockersInput("dev-1, dev-2")).toEqual(["dev-1", "dev-2"])
})

test("toggleBlocker adds, removes, and clears", () => {
  expect(toggleBlocker([], "dev-1")).toEqual(["dev-1"])
  expect(toggleBlocker(["dev-1"], "dev-1")).toEqual([])
  expect(toggleBlocker(["dev-1"], "dev-2")).toEqual(["dev-1", "dev-2"])
  expect(toggleBlocker(["dev-1", "dev-2"], "none")).toEqual([])
  expect(toggleBlocker(["dev-1"], "")).toEqual([])
})

test("assertBlockersValid rejects unknown, self, and cycles", () => {
  const tasks = [
    task({ id: "dev-1", status: "backlog" }),
    task({ id: "dev-2", status: "done", blockers: ["dev-1"] }),
  ]
  expect(assertBlockersValid(tasks, ["dev-1"])).toEqual(["dev-1"])
  expect(() => assertBlockersValid(tasks, ["dev-9"])).toThrow(/Unknown blocker 'dev-9'/)
  expect(() => assertBlockersValid(tasks, ["dev-1"], "dev-1")).toThrow(/cannot block itself/)
  expect(() => assertBlockersValid(tasks, ["dev-2"], "dev-1")).toThrow(/cycle/)
})

test("hasBlockerCycle detects a loop through existing tasks", () => {
  const tasks = [
    task({ id: "dev-1", status: "backlog", blockers: ["dev-2"] }),
    task({ id: "dev-2", status: "backlog", blockers: ["dev-3"] }),
    task({ id: "dev-3", status: "backlog" }),
  ]
  expect(hasBlockerCycle(tasks, "dev-3", ["dev-1"])).toBe(true)
  expect(hasBlockerCycle(tasks, "dev-3", ["dev-2"])).toBe(true)
  expect(hasBlockerCycle(tasks, "dev-3", [])).toBe(false)
})

test("formatBlockedError lists unfinished and missing blockers", () => {
  const tasks = [
    task({ id: "dev-1", status: "backlog" }),
    task({ id: "dev-2", status: "done" }),
    task({ id: "dev-3", status: "in_progress" }),
  ]
  expect(formatBlockedError("dev-4", tasks, ["dev-2"])).toBeNull()
  expect(formatBlockedError("dev-4", tasks, ["dev-1", "dev-2", "dev-3", "dev-9"])).toBe(
    "Task dev-4 is blocked by dev-1 (backlog), dev-3 (in_progress), dev-9 (missing).",
  )
})

test("normalizeBlockers drops blanks and none", () => {
  expect(normalizeBlockers([" dev-1 ", "none", "dev-1", ""])).toEqual(["dev-1"])
})
