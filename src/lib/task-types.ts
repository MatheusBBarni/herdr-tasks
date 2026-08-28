import type { Config } from "./types.ts"
import { fail } from "./errors.ts"

export const DEFAULT_TASK_TYPES = ["feat", "fix", "bug", "chore", "docs", "refactor", "test"] as const

export const NONE_TASK_TYPE = ""

const TYPE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/

export function parseTaskTypeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) fail("Task type cannot be empty.")
  if (!TYPE_NAME.test(trimmed)) {
    fail("Task type must match [A-Za-z][A-Za-z0-9_-]{0,31}.")
  }
  return trimmed
}

export function parseTaskTypes(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [...DEFAULT_TASK_TYPES]
  if (!Array.isArray(raw)) fail("task_types must be an array of strings.")
  if (raw.length === 0) return [...DEFAULT_TASK_TYPES]
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") fail("task_types must be an array of strings.")
    const name = parseTaskTypeName(item)
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out.length > 0 ? out : [...DEFAULT_TASK_TYPES]
}

export function parseDefaultType(raw: unknown, types: string[]): string {
  if (raw === undefined || raw === null) return types[0] ?? NONE_TASK_TYPE
  if (typeof raw !== "string") fail("default_type must be a string.")
  const trimmed = raw.trim()
  if (!trimmed) return NONE_TASK_TYPE
  const name = parseTaskTypeName(trimmed)
  if (!types.includes(name)) {
    fail(`Unknown default_type '${name}'. Known: ${types.join(", ")}`)
  }
  return name
}

export function requireTaskType(config: Config, value: string): string {
  const name = parseTaskTypeName(value)
  if (!config.task_types.includes(name)) {
    const list = config.task_types.length > 0 ? config.task_types.join(", ") : "(none)"
    fail(`Unknown type '${name}'. Known: ${list}`)
  }
  return name
}

export function normalizeTaskType(config: Config, value: string | undefined, fallback: string): string {
  if (value === undefined) return fallback
  const trimmed = value.trim()
  if (!trimmed) return NONE_TASK_TYPE
  return requireTaskType(config, trimmed)
}
