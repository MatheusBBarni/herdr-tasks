import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig } from "./config.ts"
import { createTask, editTask, getTask, initBoard, listTasks, parseTaskMarkdown, renderTaskMarkdown } from "./store.ts"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempBoard() {
  const dir = await mkdtemp(join(tmpdir(), "htasks-"))
  dirs.push(dir)
  const paths = await initBoard(dir, { prefix: "dev", agent: "claude", project: dir })
  return { dir, paths }
}

test("init writes config, tasks dir, and skill", async () => {
  const { paths } = await tempBoard()
  const config = await loadConfig(paths)
  expect(config.prefix).toBe("dev")
  expect(config.default_agent).toBe("claude")
  expect(config.agents.claude?.command).toBe("ccc")
  expect(config.herdr_behavior).toBe("workspace")
  expect(await Bun.file(paths.configPath).text()).toContain("[herdr]")
  expect(await Bun.file(paths.skillPath).exists()).toBe(true)
})

test("create and get task markdown", async () => {
  const { dir, paths } = await tempBoard()
  const task = await createTask(
    paths,
    { title: "Add login", description: "Do the thing.", agent: "grok" },
    dir,
  )
  expect(task.id).toBe("dev-1")
  expect(task.status).toBe("backlog")
  expect(task.agent).toBe("grok")
  const loaded = await getTask(paths, "dev-1")
  expect(loaded.title).toBe("Add login")
  expect(loaded.body).toContain("Do the thing.")
  const listed = await listTasks(paths)
  expect(listed.map((item) => item.id)).toEqual(["dev-1"])
  const config = await loadConfig(paths)
  expect(config.next_id).toBe(2)
})

test("edit task fields", async () => {
  const { dir, paths } = await tempBoard()
  await createTask(paths, { title: "Old" }, dir)
  const edited = await editTask(paths, "dev-1", { title: "New", agent: "codex" })
  expect(edited.title).toBe("New")
  expect(edited.agent).toBe("codex")
})

test("unknown agent is an error", async () => {
  const { dir, paths } = await tempBoard()
  await expect(createTask(paths, { title: "X", agent: "nope" }, dir)).rejects.toThrow(/Unknown agent/)
})

test("task markdown roundtrip", () => {
  const rendered = renderTaskMarkdown({
    id: "dev-1",
    title: "Add login",
    status: "backlog",
    agent: "claude",
    project: "/tmp/repo",
    created: "2026-08-28T17:00:00.000Z",
    updated: "2026-08-28T17:00:00.000Z",
    herdr: { workspace_id: null, pane_id: null, agent_name: null },
    body: "# Add login\n\nDescription.",
    filePath: "/tmp/dev-1.md",
  })
  const parsed = parseTaskMarkdown(rendered, "/tmp/dev-1.md")
  expect(parsed.id).toBe("dev-1")
  expect(parsed.title).toBe("Add login")
  expect(parsed.herdr.pane_id).toBeNull()
  expect(parsed.body).toContain("Description.")
})

test("create keeps multiline description", async () => {
  const { dir, paths } = await tempBoard()
  const task = await createTask(
    paths,
    { title: "Notes", description: "line 1\n\nline 2" },
    dir,
  )
  expect(task.body).toContain("line 1\n\nline 2")
  const edited = await editTask(paths, task.id, { description: "a\nb\nc" })
  expect(edited.body).toContain("a\nb\nc")
})
