import { stat, symlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fail } from "./errors.ts"
import { DATA_DIR_NAME } from "./root.ts"

export function worktreeBranch(type: string, id: string): string {
  const prefix = type.trim() || "task"
  return `${prefix}/${id}`
}

export function normalizeWorktree(value: string | boolean | undefined): boolean {
  if (value === undefined) return false
  if (typeof value === "boolean") return value
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed === "no" || trimmed === "false" || trimmed === "none" || trimmed === "off" || trimmed === "0") {
    return false
  }
  if (trimmed === "yes" || trimmed === "true" || trimmed === "on" || trimmed === "1") {
    return true
  }
  fail(`Unknown worktree '${value}'. Use yes or no.`)
}

export function parseWorktreeField(raw: unknown): boolean {
  if (raw === undefined || raw === null || raw === "") return false
  if (typeof raw === "boolean") return raw
  if (typeof raw === "number") {
    if (raw === 1) return true
    if (raw === 0) return false
  }
  if (typeof raw === "string") return normalizeWorktree(raw)
  fail("worktree must be yes or no.")
}

export async function linkBoardIntoWorktree(worktreePath: string, boardRoot: string): Promise<void> {
  const root = resolve(boardRoot)
  const destRoot = resolve(worktreePath)
  if (root === destRoot) return
  try {
    const destInfo = await stat(destRoot)
    if (!destInfo.isDirectory()) return
    await stat(join(root, DATA_DIR_NAME, "config.toml"))
  } catch {
    return
  }
  const target = join(root, DATA_DIR_NAME)
  const dest = join(destRoot, DATA_DIR_NAME)
  try {
    await stat(dest)
    return
  } catch {
    await symlink(target, dest)
  }
}
