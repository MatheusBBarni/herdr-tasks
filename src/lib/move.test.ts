import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setConfigValue } from "./config.ts"
import type { HerdrRunner } from "./herdr.ts"
import { moveTask } from "./move.ts"
import { createTask, getTask, initBoard, writeTask } from "./store.ts"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempBoard() {
  const dir = await mkdtemp(join(tmpdir(), "htasks-"))
  dirs.push(dir)
  const paths = await initBoard(dir, { prefix: "dev", agent: "claude", project: dir })
  const task = await createTask(paths, { title: "Ship it", project: dir }, dir)
  return { dir, paths, task }
}

function mockHerdr(opts?: {
  failCreate?: boolean
  failPrompt?: boolean
  pane?: string
}): { runner: HerdrRunner; calls: string[][] } {
  const calls: string[][] = []
  const runner: HerdrRunner = async (_bin, args) => {
    calls.push(args)
    if (args[0] === "--version") return { code: 0, stdout: "0.8.2", stderr: "" }
    if (args[0] === "status") {
      return { code: 0, stdout: JSON.stringify({ server: { running: true, status: "running" } }), stderr: "" }
    }
    if (args[0] === "workspace" && args[1] === "create") {
      if (opts?.failCreate) return { code: 1, stdout: "", stderr: "herdr: server down" }
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            workspace: { workspace_id: "w1" },
            root_pane: { pane_id: opts?.pane ?? "w1:p1" },
          },
        }),
        stderr: "",
      }
    }
    if (args[0] === "tab" && args[1] === "create") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            tab: { tab_id: "w1:t2", workspace_id: "w1" },
            root_pane: { pane_id: "w1:p2" },
          },
        }),
        stderr: "",
      }
    }
    if (args[0] === "pane" && args[1] === "split") {
      return {
        code: 0,
        stdout: JSON.stringify({ result: { pane: { pane_id: "w1:p9" } } }),
        stderr: "",
      }
    }
    if (args[0] === "pane" && args[1] === "get") {
      if (String(args[2] ?? "").includes("dead")) {
        return { code: 1, stdout: "", stderr: "not found" }
      }
      return { code: 0, stdout: "{}", stderr: "" }
    }
    if (args[0] === "pane" && args[1] === "run") return { code: 0, stdout: "{}", stderr: "" }
    if (args[0] === "agent" && args[1] === "list") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: {
            agents: [
              { pane_id: "w1:p1", agent: "grok" },
              { pane_id: "w1:p2", agent: "grok" },
              { pane_id: "w1:p9", agent: "grok" },
            ],
          },
        }),
        stderr: "",
      }
    }
    if (args[0] === "agent" && args[1] === "prompt") {
      if (opts?.failPrompt) {
        return { code: 1, stdout: "", stderr: "agent_not_found" }
      }
      return { code: 0, stdout: "{}", stderr: "" }
    }
    return { code: 1, stdout: "", stderr: `unexpected ${args.join(" ")}` }
  }
  return { runner, calls }
}

test("move to done only updates status", async () => {
  const { paths, task } = await tempBoard()
  const moved = await moveTask(paths, task.id, "done")
  expect(moved.status).toBe("done")
  expect(moved.herdr.pane_id).toBeNull()
})

test("move in_progress appends effort to the pane command", async () => {
  const { dir, paths } = await tempBoard()
  const task = await createTask(paths, { title: "Hard", effort: "high" }, dir)
  const { runner, calls } = mockHerdr()
  await moveTask(paths, task.id, "in_progress", { runner })
  expect(
    calls.some(
      (args) => args[0] === "pane" && args[1] === "run" && args[3] === "ccc --effort high",
    ),
  ).toBe(true)
})

test("move in_progress launches herdr and stores pane id", async () => {
  const { paths, task } = await tempBoard()
  const { runner, calls } = mockHerdr()
  const moved = await moveTask(paths, task.id, "in_progress", { runner })
  expect(moved.status).toBe("in_progress")
  expect(moved.herdr.workspace_id).toBe("w1")
  expect(moved.herdr.pane_id).toBe("w1:p1")
  expect(calls.some((args) => args[0] === "workspace" && args[1] === "create")).toBe(true)
  expect(calls.some((args) => args[0] === "pane" && args[1] === "run")).toBe(true)
  expect(calls.some((args) => args[0] === "agent" && args[1] === "prompt")).toBe(true)
})

test("move in_progress reverts status when herdr fails", async () => {
  const { paths, task } = await tempBoard()
  const { runner } = mockHerdr({ failCreate: true })
  await expect(moveTask(paths, task.id, "in_progress", { runner })).rejects.toThrow(/server down/)
  const loaded = await getTask(paths, task.id)
  expect(loaded.status).toBe("backlog")
})

test("move in_progress is idempotent when pane_id is set", async () => {
  const { paths, task } = await tempBoard()
  const { runner } = mockHerdr()
  const first = await moveTask(paths, task.id, "in_progress", { runner })
  const { runner: runner2, calls } = mockHerdr()
  const second = await moveTask(paths, first.id, "in_progress", { runner: runner2 })
  expect(second.status).toBe("in_progress")
  expect(second.herdr.pane_id).toBe(first.herdr.pane_id)
  expect(calls.some((args) => args[0] === "workspace")).toBe(false)
})

test("herdr_behavior tab creates a tab", async () => {
  const { paths, task } = await tempBoard()
  await setConfigValue(paths, "herdr_behavior", "tab")
  const { runner, calls } = mockHerdr()
  const moved = await moveTask(paths, task.id, "in_progress", { runner })
  expect(moved.herdr.pane_id).toBe("w1:p2")
  expect(calls.some((args) => args[0] === "tab" && args[1] === "create")).toBe(true)
  expect(calls.some((args) => args[0] === "workspace")).toBe(false)
})

test("herdr_behavior pane splits a pane", async () => {
  const { paths, task } = await tempBoard()
  await setConfigValue(paths, "herdr_behavior", "pane")
  const { runner, calls } = mockHerdr()
  const moved = await moveTask(paths, task.id, "in_progress", { runner })
  expect(moved.herdr.pane_id).toBe("w1:p9")
  expect(calls.some((args) => args[0] === "pane" && args[1] === "split")).toBe(true)
})

test("prompt failure keeps in_progress after tab create", async () => {
  const { paths, task } = await tempBoard()
  await setConfigValue(paths, "herdr_behavior", "tab")
  const { runner } = mockHerdr({ failPrompt: true })
  const moved = await moveTask(paths, task.id, "in_progress", { runner })
  expect(moved.status).toBe("in_progress")
  expect(moved.herdr.pane_id).toBe("w1:p2")
})

test("stale pane_id relaunches herdr", async () => {
  const { paths, task } = await tempBoard()
  const first = await moveTask(paths, task.id, "in_progress", { runner: mockHerdr().runner })
  first.herdr = { workspace_id: "w1", pane_id: "w1:dead", agent_name: null }
  await writeTask(first)
  const { runner, calls } = mockHerdr()
  const moved = await moveTask(paths, task.id, "in_progress", { runner })
  expect(moved.herdr.pane_id).toBe("w1:p1")
  expect(calls.some((args) => args[0] === "workspace" && args[1] === "create")).toBe(true)
})

test("move in_progress is blocked by unfinished blockers", async () => {
  const { dir, paths } = await tempBoard()
  const blocker = await createTask(paths, { title: "Blocker" }, dir)
  const blocked = await createTask(paths, { title: "Blocked", blockers: [blocker.id] }, dir)
  await expect(moveTask(paths, blocked.id, "in_progress", { runner: mockHerdr().runner })).rejects.toThrow(
    /blocked by/,
  )
  const loaded = await getTask(paths, blocked.id)
  expect(loaded.status).toBe("backlog")
  await moveTask(paths, blocker.id, "done")
  const moved = await moveTask(paths, blocked.id, "in_progress", { runner: mockHerdr().runner })
  expect(moved.status).toBe("in_progress")
})

test("bad lane is an error", async () => {
  const { paths, task } = await tempBoard()
  await expect(moveTask(paths, task.id, "later")).rejects.toThrow(/Unknown lane/)
})
