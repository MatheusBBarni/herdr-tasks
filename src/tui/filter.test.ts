import { expect, test } from "bun:test"
import type { Task } from "../lib/types.ts"
import { filterTasks, taskMatchesQuery } from "./filter.ts"

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    status: "backlog",
    order: 0,
    type: "feat",
    agent: "pi",
    effort: "",
    project: "/Users/me/herdr-tasks",
    created: "",
    updated: "",
    herdr: { workspace_id: null, pane_id: null, agent_name: null },
    blockers: [],
    worktree: false,
    body: "",
    filePath: "",
    ...partial,
  }
}

const tasks: Task[] = [
  task({ id: "dev-1", title: "Fix login redirect", body: "OAuth callback" }),
  task({ id: "dev-2", title: "Ship board filter", type: "feat", agent: "omp" }),
  task({
    id: "dev-3",
    title: "Docs",
    project: "/tmp/other",
    blockers: ["dev-1"],
    effort: "high",
  }),
]

test("empty query keeps every task", () => {
  expect(filterTasks(tasks, "").map((item) => item.id)).toEqual(["dev-1", "dev-2", "dev-3"])
  expect(filterTasks(tasks, "   ").map((item) => item.id)).toEqual(["dev-1", "dev-2", "dev-3"])
})

test("matches id, title, description, type, agent, project, blockers, effort", () => {
  expect(filterTasks(tasks, "dev-2").map((item) => item.id)).toEqual(["dev-2"])
  expect(filterTasks(tasks, "login").map((item) => item.id)).toEqual(["dev-1"])
  expect(filterTasks(tasks, "oauth").map((item) => item.id)).toEqual(["dev-1"])
  expect(filterTasks(tasks, "omp").map((item) => item.id)).toEqual(["dev-2"])
  expect(filterTasks(tasks, "other").map((item) => item.id)).toEqual(["dev-3"])
  expect(filterTasks(tasks, "dev-1").map((item) => item.id)).toEqual(["dev-1", "dev-3"])
  expect(filterTasks(tasks, "high").map((item) => item.id)).toEqual(["dev-3"])
})

test("lowercase query is case-insensitive; mixed case is sensitive", () => {
  expect(taskMatchesQuery(tasks[0]!, "login")).toBe(true)
  expect(taskMatchesQuery(tasks[0]!, "LOGIN")).toBe(false)
  expect(taskMatchesQuery(tasks[0]!, "OAuth")).toBe(true)
})

test("whitespace tokens are ANDed", () => {
  expect(filterTasks(tasks, "dev ship").map((item) => item.id)).toEqual(["dev-2"])
  expect(filterTasks(tasks, "dev missing")).toEqual([])
})
