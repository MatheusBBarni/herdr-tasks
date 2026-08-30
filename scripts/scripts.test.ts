import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function bashN(script: string) {
  const proc = Bun.spawn(["bash", "-n", join(root, "scripts", script)], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
  return { code, stderr }
}

test("plugin scripts are valid bash", async () => {
  for (const script of ["open-board.sh", "run-board.sh", "plugin-build.sh", "install-cli.sh"]) {
    const result = await bashN(script)
    expect(result.code, result.stderr).toBe(0)
  }
})

test("herdr-plugin.toml declares htasks overlay and open-board", async () => {
  const text = await Bun.file(join(root, "herdr-plugin.toml")).text()
  expect(text).toContain('id = "htasks"')
  expect(text).toContain('min_herdr_version = "0.8.2"')
  expect(text).toContain('platforms = ["linux", "macos"]')
  expect(text).toContain('placement = "overlay"')
  expect(text).toContain('id = "board"')
  expect(text).toContain('id = "open-board"')
  expect(text).toContain("scripts/open-board.sh")
  expect(text).toContain("scripts/run-board.sh")
})

test("install-cli copies htasks into HTASKS_CLI_INSTALL_DIR", async () => {
  const dir = await mkdtemp(join(tmpdir(), "htasks-cli-"))
  dirs.push(dir)
  const proc = Bun.spawn(["bash", join(root, "scripts/install-cli.sh")], {
    cwd: root,
    env: { ...process.env, HTASKS_CLI_INSTALL_DIR: dir, HOME: dir },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  expect(code, stdout + stderr).toBe(0)
  expect(await Bun.file(join(dir, "htasks")).exists()).toBe(true)
  expect(await Bun.file(join(dir, ".htasks-cli-managed")).exists()).toBe(true)
})
