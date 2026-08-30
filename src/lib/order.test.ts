import { expect, test } from "bun:test"
import {
  applyReorder,
  nextOrder,
  parseOrder,
  sortTasks,
  tasksInLane,
} from "./order.ts"
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
    worktree: false,
    body: "",
    filePath: "",
    order: 0,
    ...partial,
  }
}

test("parseOrder defaults missing and junk to 0", () => {
  expect(parseOrder(undefined)).toBe(0)
  expect(parseOrder(null)).toBe(0)
  expect(parseOrder("")).toBe(0)
  expect(parseOrder("nope")).toBe(0)
  expect(parseOrder(Number.NaN)).toBe(0)
  expect(parseOrder(2.9)).toBe(2)
  expect(parseOrder("3")).toBe(3)
})

test("nextOrder appends after the highest in that lane", () => {
  expect(nextOrder([], "backlog")).toBe(0)
  const tasks = [
    task({ id: "dev-1", status: "backlog", order: 0 }),
    task({ id: "dev-2", status: "backlog", order: 4 }),
    task({ id: "dev-3", status: "done", order: 9 }),
  ]
  expect(nextOrder(tasks, "backlog")).toBe(5)
  expect(nextOrder(tasks, "backlog", "dev-2")).toBe(1)
})

test("sortTasks is lane then order then id", () => {
  const listed = sortTasks([
    task({ id: "dev-2", status: "done", order: 0 }),
    task({ id: "dev-10", status: "backlog", order: 1 }),
    task({ id: "dev-1", status: "backlog", order: 0 }),
  ])
  expect(listed.map((item) => item.id)).toEqual(["dev-1", "dev-10", "dev-2"])
})

test("tasksInLane sorts by order, not filename", () => {
  const lane = tasksInLane(
    [
      task({ id: "dev-2", status: "backlog", order: 0 }),
      task({ id: "dev-1", status: "backlog", order: 2 }),
      task({ id: "dev-3", status: "in_progress", order: 0 }),
    ],
    "backlog",
  )
  expect(lane.map((item) => item.id)).toEqual(["dev-2", "dev-1"])
})

test("applyReorder moves a card down and reindexes the lane", () => {
  const tasks = [
    task({ id: "dev-1", status: "backlog", order: 0 }),
    task({ id: "dev-2", status: "backlog", order: 1 }),
    task({ id: "dev-3", status: "done", order: 0 }),
  ]
  const { tasks: next, changed } = applyReorder(tasks, "dev-1", 1, "2026-01-01T00:00:00.000Z")
  expect(next.map((item) => item.id)).toEqual(["dev-2", "dev-1", "dev-3"])
  expect(next.find((item) => item.id === "dev-1")?.order).toBe(1)
  expect(next.find((item) => item.id === "dev-2")?.order).toBe(0)
  expect(changed.map((item) => item.id).sort()).toEqual(["dev-1", "dev-2"])
})

test("applyReorder is a no-op at the edge", () => {
  const tasks = [
    task({ id: "dev-1", status: "backlog", order: 0 }),
    task({ id: "dev-2", status: "backlog", order: 1 }),
  ]
  const { tasks: next, changed } = applyReorder(tasks, "dev-1", -1)
  expect(changed).toEqual([])
  expect(next.map((item) => item.id)).toEqual(["dev-1", "dev-2"])
})

test("applyReorder densifies a lane that had tied missing orders", () => {
  const tasks = [
    task({ id: "dev-2", status: "backlog", order: 0 }),
    task({ id: "dev-1", status: "backlog", order: 0 }),
  ]
  const { tasks: next } = applyReorder(tasks, "dev-1", 1)
  expect(next.map((item) => [item.id, item.order])).toEqual([
    ["dev-2", 0],
    ["dev-1", 1],
  ])
})
