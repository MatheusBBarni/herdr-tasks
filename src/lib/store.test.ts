import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig, saveConfig } from "./config.ts"
import { REVIEW_PROMPT_REL } from "./root.ts"
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

test("init writes config, tasks dir, skill, and review prompt", async () => {
  const { paths } = await tempBoard()
  const config = await loadConfig(paths)
  expect(config.prefix).toBe("dev")
  expect(config.default_agent).toBe("claude")
  expect(config.agents.claude?.command).toBe("ccc")
  expect(config.herdr_behavior).toBe("workspace")
  expect(config.theme).toBe("nord")
  expect(config.task_types).toContain("feat")
  expect(config.default_type).toBe("feat")
  expect(config.review.prompt).toBe(REVIEW_PROMPT_REL)
  expect(await Bun.file(paths.configPath).text()).toContain("[herdr]")
  expect(await Bun.file(paths.configPath).text()).toContain(REVIEW_PROMPT_REL)
  expect(await Bun.file(paths.skillPath).exists()).toBe(true)
  expect(await Bun.file(paths.reviewPromptPath).exists()).toBe(true)
  expect(await Bun.file(paths.reviewPromptPath).text()).toContain("Review the implementation")
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
  expect(task.type).toBe("feat")
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
  const edited = await editTask(paths, "dev-1", { title: "New", agent: "codex", type: "bug" })
  expect(edited.title).toBe("New")
  expect(edited.agent).toBe("codex")
  expect(edited.type).toBe("bug")
})

test("edit rejects done tasks", async () => {
  const { dir, paths } = await tempBoard()
  await createTask(paths, { title: "Shipped", status: "done" }, dir)
  await expect(editTask(paths, "dev-1", { title: "Nope" })).rejects.toThrow(/Cannot edit a done task/)
})

test("create and edit task type", async () => {
  const { dir, paths } = await tempBoard()
  const task = await createTask(paths, { title: "Typed", type: "fix" }, dir)
  expect(task.type).toBe("fix")
  expect(await Bun.file(task.filePath).text()).toContain("type: fix")
  const cleared = await editTask(paths, task.id, { type: "" })
  expect(cleared.type).toBe("")
  expect(await Bun.file(cleared.filePath).text()).not.toContain("type:")
})

test("unknown type is an error", async () => {
  const { dir, paths } = await tempBoard()
  await expect(createTask(paths, { title: "X", type: "epic" }, dir)).rejects.toThrow(/Unknown type/)
})

test("unknown agent is an error", async () => {
  const { dir, paths } = await tempBoard()
  await expect(createTask(paths, { title: "X", agent: "nope" }, dir)).rejects.toThrow(/Unknown agent/)
})

test("create resolves project key from config", async () => {
  const { dir, paths } = await tempBoard()
  const config = await loadConfig(paths)
  config.projects = {
    "herdr-tasks": { name: "herdr-tasks", path: dir },
  }
  await saveConfig(paths, config)
  const task = await createTask(paths, { title: "X", project: "herdr-tasks" }, dir)
  expect(task.project).toBe(dir)
})

test("unknown project key is an error", async () => {
  const { dir, paths } = await tempBoard()
  const config = await loadConfig(paths)
  config.projects = {
    "herdr-tasks": { name: "herdr-tasks", path: dir },
  }
  await saveConfig(paths, config)
  await expect(createTask(paths, { title: "X", project: "nope" }, dir)).rejects.toThrow(
    /Unknown project 'nope'/
  )
})

test("edit resolves project key from config", async () => {
  const { dir, paths } = await tempBoard()
  const task = await createTask(paths, { title: "X" }, dir)
  const config = await loadConfig(paths)
  config.projects = {
    other: { name: "other", path: dir },
  }
  await saveConfig(paths, config)
  const edited = await editTask(paths, task.id, { project: "other" })
  expect(edited.project).toBe(dir)
})

test("task markdown roundtrip", () => {
  const rendered = renderTaskMarkdown({
    id: "dev-1",
    title: "Add login",
    status: "backlog",
    type: "feat",
    agent: "claude",
    effort: "",
    project: "/tmp/repo",
    created: "2026-08-28T17:00:00.000Z",
    updated: "2026-08-28T17:00:00.000Z",
    herdr: { workspace_id: null, pane_id: null, agent_name: null },
    blockers: [],
    worktree: false,
    body: "# Add login\n\nDescription.",
    filePath: "/tmp/dev-1.md",
  })
  const parsed = parseTaskMarkdown(rendered, "/tmp/dev-1.md")
  expect(parsed.id).toBe("dev-1")
  expect(parsed.title).toBe("Add login")
  expect(parsed.type).toBe("feat")
  expect(parsed.blockers).toEqual([])
  expect(parsed.herdr.pane_id).toBeNull()
  expect(parsed.body).toContain("Description.")
})

test("task markdown with blockers roundtrips", () => {
  const rendered = renderTaskMarkdown({
    id: "dev-2",
    title: "Blocked",
    status: "backlog",
    type: "feat",
    agent: "claude",
    effort: "high",
    project: "/tmp/repo",
    created: "2026-08-28T17:00:00.000Z",
    updated: "2026-08-28T17:00:00.000Z",
    herdr: { workspace_id: null, pane_id: null, agent_name: null },
    blockers: ["dev-1"],
    worktree: false,
    body: "# Blocked",
    filePath: "/tmp/dev-2.md",
  })
  expect(rendered).toContain("blockers:")
  expect(rendered).toContain("dev-1")
  const parsed = parseTaskMarkdown(rendered, "/tmp/dev-2.md")
  expect(parsed.blockers).toEqual(["dev-1"])
  expect(parsed.effort).toBe("high")
  expect(rendered).toContain("effort: high")
})

test("task markdown without type parses as empty", () => {
  const parsed = parseTaskMarkdown(
    `---
id: dev-2
title: Untyped
status: backlog
agent: claude
project: /tmp/repo
created: 2026-08-28T17:00:00.000Z
updated: 2026-08-28T17:00:00.000Z
herdr:
  workspace_id: null
  pane_id: null
  agent_name: null
---

# Untyped
`,
    "/tmp/dev-2.md",
  )
  expect(parsed.type).toBe("")
})

test("create and edit blockers", async () => {
  const { dir, paths } = await tempBoard()
  const blocker = await createTask(paths, { title: "First" }, dir)
  const task = await createTask(paths, { title: "Second", blockers: [blocker.id] }, dir)
  expect(task.blockers).toEqual([blocker.id])
  expect(await Bun.file(task.filePath).text()).toContain("blockers:")
  const cleared = await editTask(paths, task.id, { blockers: [] })
  expect(cleared.blockers).toEqual([])
  expect(await Bun.file(cleared.filePath).text()).not.toContain("blockers:")
})

test("unknown blocker is an error", async () => {
  const { dir, paths } = await tempBoard()
  await expect(createTask(paths, { title: "X", blockers: ["dev-99"] }, dir)).rejects.toThrow(
    /Unknown blocker/,
  )
})

test("task cannot block itself", async () => {
  const { dir, paths } = await tempBoard()
  await createTask(paths, { title: "First" }, dir)
  await expect(editTask(paths, "dev-1", { blockers: ["dev-1"] })).rejects.toThrow(/cannot block itself/)
})

test("create keeps an image markdown link in the description", async () => {
  const { dir, paths } = await tempBoard()
  const task = await createTask(
    paths,
    { title: "Shot", description: "See ![login](https://ex.com/a.png)" },
    dir,
  )
  expect(task.body).toContain("![login](https://ex.com/a.png)")
  const loaded = await getTask(paths, task.id)
  expect(loaded.body).toContain("![login](https://ex.com/a.png)")
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

test("create and edit effort", async () => {
  const { dir, paths } = await tempBoard()
  const task = await createTask(paths, { title: "Hard", effort: "high" }, dir)
  expect(task.effort).toBe("high")
  expect(await Bun.file(task.filePath).text()).toContain("effort: high")
  const edited = await editTask(paths, task.id, { effort: "low" })
  expect(edited.effort).toBe("low")
  const cleared = await editTask(paths, task.id, { effort: "none" })
  expect(cleared.effort).toBe("")
  expect(await Bun.file(cleared.filePath).text()).not.toContain("effort:")
})

test("create and edit worktree", async () => {
  const { dir, paths } = await tempBoard()
  const task = await createTask(paths, { title: "Isolated", worktree: true }, dir)
  expect(task.worktree).toBe(true)
  expect(await Bun.file(task.filePath).text()).toContain("worktree: true")
  const cleared = await editTask(paths, task.id, { worktree: false })
  expect(cleared.worktree).toBe(false)
  expect(await Bun.file(cleared.filePath).text()).not.toContain("worktree:")
})

test("unknown worktree is an error", async () => {
  const { dir, paths } = await tempBoard()
  await expect(createTask(paths, { title: "X", worktree: "maybe" }, dir)).rejects.toThrow(/Unknown worktree/)
})

test("task markdown without worktree parses as false", () => {
  const parsed = parseTaskMarkdown(
    `---
id: dev-2
title: Untyped
status: backlog
agent: claude
project: /tmp/repo
created: 2026-08-28T17:00:00.000Z
updated: 2026-08-28T17:00:00.000Z
herdr:
  workspace_id: null
  pane_id: null
  agent_name: null
---

# Untyped
`,
    "/tmp/dev-2.md",
  )
  expect(parsed.worktree).toBe(false)
})

test("unknown effort is an error", async () => {
  const { dir, paths } = await tempBoard()
  await expect(createTask(paths, { title: "X", effort: "turbo" }, dir)).rejects.toThrow(/Unknown effort/)
})

test("task markdown without effort parses as empty", async () => {
  const parsed = parseTaskMarkdown(
    `---
id: dev-2
title: Untyped
status: backlog
agent: claude
project: /tmp/repo
created: 2026-08-28T17:00:00.000Z
updated: 2026-08-28T17:00:00.000Z
herdr:
  workspace_id: null
  pane_id: null
  agent_name: null
---

# Untyped
`,
    "/tmp/dev-2.md",
  )
  expect(parsed.effort).toBe("")
})
