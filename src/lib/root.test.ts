import { afterEach, expect, test } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cwdFromPluginContextJson, findBoardRoot, searchStart } from "./root.ts"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

test("cwdFromPluginContextJson prefers worktree checkout then workspace cwd", () => {
  expect(cwdFromPluginContextJson(undefined)).toBeNull()
  expect(cwdFromPluginContextJson("not-json")).toBeNull()
  expect(
    cwdFromPluginContextJson(
      JSON.stringify({
        workspace: { cwd: "/ws", worktree: { checkout_path: "/wt" } },
        pane: { cwd: "/pane" },
      }),
    ),
  ).toBe("/wt")
  expect(
    cwdFromPluginContextJson(
      JSON.stringify({
        workspace: { cwd: "/ws" },
        pane: { foreground_cwd: "/fg", cwd: "/pane" },
      }),
    ),
  ).toBe("/ws")
  expect(cwdFromPluginContextJson(JSON.stringify({ pane: { cwd: "/pane" } }))).toBe("/pane")
})

test("searchStart uses HTASKS_ROOT then plugin context then fallback", () => {
  expect(searchStart({ HTASKS_ROOT: "/board-root" }, "/cwd")).toBe("/board-root")
  expect(
    searchStart(
      { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace: { cwd: "/from-context" } }) },
      "/cwd",
    ),
  ).toBe("/from-context")
  expect(searchStart({}, "/explicit-cwd")).toBe("/explicit-cwd")
})

test("findBoardRoot walks from HTASKS_ROOT rather than process cwd", async () => {
  const board = join(tmpdir(), `htasks-root-${crypto.randomUUID()}`)
  const other = join(tmpdir(), `htasks-other-${crypto.randomUUID()}`)
  dirs.push(board, other)
  await mkdir(join(board, ".herdr-tasks"), { recursive: true })
  await writeFile(join(board, ".herdr-tasks", "config.toml"), "prefix = \"dev\"\n")
  await mkdir(other, { recursive: true })
  expect(await findBoardRoot(searchStart({ HTASKS_ROOT: board }, other))).toBe(board)
  expect(await findBoardRoot(other)).toBeNull()
})
