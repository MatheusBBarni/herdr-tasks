import { fail } from "./errors.ts"
import type { Task } from "./types.ts"

export function normalizeBlockers(ids: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = raw.trim()
    if (!id || id === "none") continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function parseBlockers(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === "") return []
  if (typeof raw === "string") return normalizeBlockers([raw])
  if (Array.isArray(raw)) {
    return normalizeBlockers(
      raw.map((item) => {
        if (typeof item === "string") return item
        if (typeof item === "number" || typeof item === "boolean") return String(item)
        return ""
      }),
    )
  }
  fail("blockers must be a task id or a list of task ids.")
}

export function parseBlockersInput(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed || trimmed === "none") return []
  return normalizeBlockers(trimmed.split(","))
}

export function toggleBlocker(current: readonly string[], id: string): string[] {
  const value = id.trim()
  if (!value || value === "none") return []
  if (current.includes(value)) return current.filter((item) => item !== value)
  return [...current, value]
}

export function hasBlockerCycle(tasks: readonly Task[], selfId: string, blockerIds: readonly string[]): boolean {
  const graph = new Map<string, readonly string[]>()
  for (const task of tasks) graph.set(task.id, task.blockers)
  graph.set(selfId, blockerIds)

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const dfs = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const next of graph.get(id) ?? []) {
      if (dfs(next)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return dfs(selfId)
}

export function assertBlockersValid(tasks: readonly Task[], ids: readonly string[], selfId?: string): string[] {
  const unique = normalizeBlockers(ids)
  if (selfId && unique.includes(selfId)) fail("Task cannot block itself.")
  const known = new Set(tasks.map((task) => task.id))
  const missing = unique.filter((id) => !known.has(id))
  if (missing.length === 1) fail(`Unknown blocker '${missing[0]}'.`)
  if (missing.length > 1) {
    fail(`Unknown blockers ${missing.map((id) => `'${id}'`).join(", ")}.`)
  }
  if (selfId && hasBlockerCycle(tasks, selfId, unique)) fail("Blockers would create a cycle.")
  return unique
}

export function unfinishedBlockers(tasks: readonly Task[], blockerIds: readonly string[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const parts: string[] = []
  for (const id of blockerIds) {
    const blocker = byId.get(id)
    if (!blocker) {
      parts.push(`${id} (missing)`)
      continue
    }
    if (blocker.status !== "done") parts.push(`${id} (${blocker.status})`)
  }
  return parts
}

export function formatBlockedError(taskId: string, tasks: readonly Task[], blockerIds: readonly string[]): string | null {
  const parts = unfinishedBlockers(tasks, blockerIds)
  if (parts.length === 0) return null
  return `Task ${taskId} is blocked by ${parts.join(", ")}.`
}
