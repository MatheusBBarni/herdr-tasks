import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  linkBoardIntoWorktree,
  normalizeWorktree,
  parseWorktreeField,
  worktreeBranch,
} from "./worktree.ts"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

test("worktreeBranch is type/id and falls back to task/", () => {
  expect(worktreeBranch("feat", "dev-11")).toBe("feat/dev-11")
  expect(worktreeBranch("fix", "dev-2")).toBe("fix/dev-2")
  expect(worktreeBranch("", "dev-3")).toBe("task/dev-3")
  expect(worktreeBranch("  ", "dev-3")).toBe("task/dev-3")
})

test("normalizeWorktree accepts yes/no aliases", () => {
  expect(normalizeWorktree(undefined)).toBe(false)
  expect(normalizeWorktree(true)).toBe(true)
  expect(normalizeWorktree(false)).toBe(false)
  expect(normalizeWorktree("yes")).toBe(true)
  expect(normalizeWorktree("Yes")).toBe(true)
  expect(normalizeWorktree("true")).toBe(true)
  expect(normalizeWorktree("no")).toBe(false)
  expect(normalizeWorktree("none")).toBe(false)
  expect(normalizeWorktree("")).toBe(false)
  expect(() => normalizeWorktree("maybe")).toThrow(/Unknown worktree/)
})

test("parseWorktreeField reads yaml booleans and strings", () => {
  expect(parseWorktreeField(undefined)).toBe(false)
  expect(parseWorktreeField(true)).toBe(true)
  expect(parseWorktreeField("yes")).toBe(true)
  expect(parseWorktreeField(1)).toBe(true)
  expect(parseWorktreeField(0)).toBe(false)
})

test("linkBoardIntoWorktree symlinks .herdr-tasks when missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "htasks-board-"))
  const worktree = await mkdtemp(join(tmpdir(), "htasks-wt-"))
  dirs.push(root, worktree)
  await mkdir(join(root, ".herdr-tasks"), { recursive: true })
  await writeFile(join(root, ".herdr-tasks", "config.toml"), "prefix = \"dev\"\n")
  await linkBoardIntoWorktree(worktree, root)
  const linked = await stat(join(worktree, ".herdr-tasks"))
  expect(linked.isDirectory() || linked.isSymbolicLink()).toBe(true)
  expect(await Bun.file(join(worktree, ".herdr-tasks", "config.toml")).text()).toContain("prefix")
  await linkBoardIntoWorktree(worktree, root)
  await linkBoardIntoWorktree(root, root)
})
