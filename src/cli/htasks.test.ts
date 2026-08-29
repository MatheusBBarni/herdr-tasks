import { afterEach, expect, test } from "bun:test"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const cli = join(import.meta.dir, "htasks.ts")
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function run(cwd: string, args: string[]) {
  const proc = Bun.spawn(["bun", cli, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "htasks-cli-"))
  dirs.push(dir)
  return dir
}

test("cli init, create, list json, show, move done", async () => {
  const dir = await tempDir()
  const init = await run(dir, ["init", "--prefix", "dev", "--agent", "claude", "--project", dir])
  expect(init.code).toBe(0)
  expect(init.stdout).toContain(".herdr-tasks")

  const created = await run(dir, ["create", "--title", "Add login", "--description", "Do it"])
  expect(created.code).toBe(0)
  expect(created.stdout.trim()).toBe("dev-1")

  const list = await run(dir, ["list", "--json"])
  expect(list.code).toBe(0)
  const tasks = JSON.parse(list.stdout) as Array<{ id: string; status: string; type: string }>
  expect(tasks[0]?.id).toBe("dev-1")
  expect(tasks[0]?.status).toBe("backlog")
  expect(tasks[0]?.type).toBe("feat")

  const shown = await run(dir, ["show", "dev-1", "--json"])
  expect(shown.code).toBe(0)
  expect(JSON.parse(shown.stdout).title).toBe("Add login")

  const moved = await run(dir, ["move", "dev-1", "done"])
  expect(moved.code).toBe(0)
  expect(moved.stdout).toContain("done")

  const root = await run(dir, ["root"])
  expect(root.stdout.trim()).toBe(await realpath(dir))

  const path = await run(dir, ["path", "dev-1"])
  expect(path.stdout).toContain("dev-1.md")
})

test("cli errors on missing board and unknown id", async () => {
  const dir = await tempDir()
  const list = await run(dir, ["list"])
  expect(list.code).not.toBe(0)
  expect(list.stderr).toContain("htasks init")

  await run(dir, ["init"])
  const show = await run(dir, ["show", "dev-99"])
  expect(show.code).not.toBe(0)
  expect(show.stderr).toContain("Unknown task")
})

test("cli config set and get theme", async () => {
  const dir = await tempDir()
  const init = await run(dir, ["init"])
  expect(init.code).toBe(0)
  const set = await run(dir, ["config", "set", "theme", "dracula"])
  expect(set.code).toBe(0)
  expect(set.stdout).toContain("theme=dracula")
  const get = await run(dir, ["config", "get", "theme"])
  expect(get.code).toBe(0)
  expect(get.stdout.trim()).toBe("dracula")
  const alias = await run(dir, ["config", "set", "theme", "catppuccin-light"])
  expect(alias.code).toBe(0)
  const got = await run(dir, ["config", "get", "theme"])
  expect(got.stdout.trim()).toBe("catppuccin_light")
  const bad = await run(dir, ["config", "set", "theme", "solarized"])
  expect(bad.code).not.toBe(0)
  expect(bad.stderr).toContain("Unknown theme")
})

test("cli edit rejects done tasks", async () => {
  const dir = await tempDir()
  expect((await run(dir, ["init", "--project", dir])).code).toBe(0)
  const created = await run(dir, ["create", "--title", "Shipped", "--status", "done"])
  expect(created.code).toBe(0)
  const edited = await run(dir, ["edit", created.stdout.trim(), "--title", "Nope"])
  expect(edited.code).not.toBe(0)
  expect(edited.stderr).toContain("Cannot edit a done task")
})

test("cli create and edit --effort", async () => {
  const dir = await tempDir()
  expect((await run(dir, ["init", "--project", dir])).code).toBe(0)
  const created = await run(dir, ["create", "--title", "Hard", "--effort", "high"])
  expect(created.code).toBe(0)
  const shown = await run(dir, ["show", created.stdout.trim(), "--json"])
  expect(JSON.parse(shown.stdout).effort).toBe("high")
  const edited = await run(dir, ["edit", created.stdout.trim(), "--effort", "low"])
  expect(edited.code).toBe(0)
  const again = await run(dir, ["show", created.stdout.trim(), "--json"])
  expect(JSON.parse(again.stdout).effort).toBe("low")
  const cleared = await run(dir, ["edit", created.stdout.trim(), "--effort", "none"])
  expect(cleared.code).toBe(0)
  expect(JSON.parse((await run(dir, ["show", created.stdout.trim(), "--json"])).stdout).effort).toBe("")
  const bad = await run(dir, ["create", "--title", "Nope", "--effort", "turbo"])
  expect(bad.code).not.toBe(0)
  expect(bad.stderr).toContain("Unknown effort")
})

test("cli create and edit --type", async () => {
  const dir = await tempDir()
  expect((await run(dir, ["init", "--project", dir])).code).toBe(0)
  const created = await run(dir, ["create", "--title", "Crash", "--type", "bug"])
  expect(created.code).toBe(0)
  const shown = await run(dir, ["show", created.stdout.trim(), "--json"])
  expect(JSON.parse(shown.stdout).type).toBe("bug")
  const edited = await run(dir, ["edit", created.stdout.trim(), "--type", "fix"])
  expect(edited.code).toBe(0)
  const again = await run(dir, ["show", created.stdout.trim(), "--json"])
  expect(JSON.parse(again.stdout).type).toBe("fix")
  const bad = await run(dir, ["create", "--title", "Nope", "--type", "epic"])
  expect(bad.code).not.toBe(0)
  expect(bad.stderr).toContain("Unknown type")
})

test("cli create and edit --blockers", async () => {
  const dir = await tempDir()
  expect((await run(dir, ["init", "--project", dir])).code).toBe(0)
  expect((await run(dir, ["create", "--title", "First"])).code).toBe(0)
  const created = await run(dir, ["create", "--title", "Second", "--blockers", "dev-1"])
  expect(created.code).toBe(0)
  const shown = await run(dir, ["show", created.stdout.trim(), "--json"])
  expect(JSON.parse(shown.stdout).blockers).toEqual(["dev-1"])
  const blocked = await run(dir, ["move", created.stdout.trim(), "in_progress"])
  expect(blocked.code).not.toBe(0)
  expect(blocked.stderr).toContain("blocked by")
  const cleared = await run(dir, ["edit", created.stdout.trim(), "--blockers", "none"])
  expect(cleared.code).toBe(0)
  const again = await run(dir, ["show", created.stdout.trim(), "--json"])
  expect(JSON.parse(again.stdout).blockers).toEqual([])
  const missing = await run(dir, ["create", "--title", "Nope", "--blockers", "dev-99"])
  expect(missing.code).not.toBe(0)
  expect(missing.stderr).toContain("Unknown blocker")
})

test("cli create --project accepts a config key", async () => {
  const dir = await tempDir()
  expect((await run(dir, ["init", "--project", dir])).code).toBe(0)
  const configPath = join(dir, ".herdr-tasks/config.toml")
  const text = await Bun.file(configPath).text()
  await Bun.write(
    configPath,
    `${text}
[projects.herdr-tasks]
name = "herdr-tasks"
path = ${JSON.stringify(dir)}
`,
  )
  const created = await run(dir, ["create", "--title", "Keyed", "--project", "herdr-tasks"])
  expect(created.code).toBe(0)
  const shown = await run(dir, ["show", created.stdout.trim(), "--json"])
  expect(JSON.parse(shown.stdout).project).toBe(dir)
  const bad = await run(dir, ["create", "--title", "Nope", "--project", "nope"])
  expect(bad.code).not.toBe(0)
  expect(bad.stderr).toContain("Unknown project")
})

test("cli create and edit --worktree", async () => {
  const dir = await tempDir()
  expect((await run(dir, ["init", "--project", dir])).code).toBe(0)
  const created = await run(dir, ["create", "--title", "Isolated", "--worktree", "yes"])
  expect(created.code).toBe(0)
  const shown = await run(dir, ["show", created.stdout.trim(), "--json"])
  expect(JSON.parse(shown.stdout).worktree).toBe(true)
  const human = await run(dir, ["show", created.stdout.trim()])
  expect(human.stdout).toContain("worktree yes")
  const edited = await run(dir, ["edit", created.stdout.trim(), "--worktree", "no"])
  expect(edited.code).toBe(0)
  expect(JSON.parse((await run(dir, ["show", created.stdout.trim(), "--json"])).stdout).worktree).toBe(false)
  const bad = await run(dir, ["create", "--title", "Nope", "--worktree", "maybe"])
  expect(bad.code).not.toBe(0)
  expect(bad.stderr).toContain("Unknown worktree")
})

test("cli doctor json reports checks", async () => {
  const dir = await tempDir()
  const doc = await run(dir, ["doctor", "--json"])
  const report = JSON.parse(doc.stdout) as { checks: Array<{ id: string; status: string }> }
  expect(report.checks.some((check) => check.id === "bun")).toBe(true)
  expect(report.checks.some((check) => check.id === "herdr")).toBe(true)
  expect(report.checks.some((check) => check.id === "herdr_skill")).toBe(true)
})
