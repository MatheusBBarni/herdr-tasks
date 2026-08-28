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
  const tasks = JSON.parse(list.stdout) as Array<{ id: string; status: string }>
  expect(tasks[0]?.id).toBe("dev-1")
  expect(tasks[0]?.status).toBe("backlog")

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

test("cli doctor json reports checks", async () => {
  const dir = await tempDir()
  const doc = await run(dir, ["doctor", "--json"])
  const report = JSON.parse(doc.stdout) as { checks: Array<{ id: string; status: string }> }
  expect(report.checks.some((check) => check.id === "bun")).toBe(true)
  expect(report.checks.some((check) => check.id === "herdr")).toBe(true)
  expect(report.checks.some((check) => check.id === "herdr_skill")).toBe(true)
})
