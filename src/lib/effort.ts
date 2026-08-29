import { fail } from "./errors.ts"

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const
export type Effort = (typeof EFFORTS)[number]

export const NONE_EFFORT = ""

export function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value)
}

export function effortList(): string {
  return EFFORTS.join(", ")
}

export function normalizeEffort(value: string | undefined): string {
  if (value === undefined) return NONE_EFFORT
  const trimmed = value.trim()
  if (!trimmed || trimmed === "none") return NONE_EFFORT
  if (!isEffort(trimmed)) {
    fail(`Unknown effort '${trimmed}'. Known: ${effortList()}.`)
  }
  return trimmed
}

/** Flags appended to the pane command when a task has effort set. */
export function effortArgs(kind: string | undefined, effort: string): string | undefined {
  const level = effort.trim()
  if (!level) return undefined
  const k = (kind ?? "").trim().toLowerCase()
  if (k === "pi") return `--thinking ${level}`
  if (k === "codex") {
    const mapped = level === "max" ? "xhigh" : level
    return `-c model_reasoning_effort=${mapped}`
  }
  return `--effort ${level}`
}

export function commandWithEffort(
  command: string,
  kind: string | undefined,
  effort: string,
): string {
  const flag = effortArgs(kind, effort)
  if (!flag) return command
  return `${command.trim()} ${flag}`
}
