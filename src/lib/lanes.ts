import { basename, isAbsolute, resolve } from "node:path"
import { fail } from "./errors.ts"
import { pathExists, readText } from "./fs.ts"
import type { BoardPaths } from "./root.ts"
import { LANES, type Config, type LaneDef } from "./types.ts"

export const LANE_ID_RE = /^[a-z][a-z0-9_]*$/

const DEFAULT_NAMES: Record<string, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
}

const DEFAULT_NEXT: Record<string, string> = {
  backlog: "in_progress",
  in_progress: "review",
  review: "done",
  done: "",
}

export function isLaneId(value: string): boolean {
  return LANE_ID_RE.test(value)
}

export function requireLaneId(value: string): string {
  const id = value.trim()
  if (!isLaneId(id)) {
    fail(`Invalid lane identifier '${value}'. Use [a-z][a-z0-9_]*.`)
  }
  return id
}

export function defaultLaneName(id: string): string {
  const known = DEFAULT_NAMES[id]
  if (known) return known
  return id
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function defaultNextStep(id: string): string {
  return DEFAULT_NEXT[id] ?? ""
}

export function defaultLaneDef(id: string): LaneDef {
  return {
    name: defaultLaneName(id),
    prompt: "",
    next_step: defaultNextStep(id),
  }
}

export function resolvedLaneDef(config: Pick<Config, "lane_defs">, id: string): LaneDef {
  const custom = config.lane_defs[id]
  if (!custom) return defaultLaneDef(id)
  return {
    name: custom.name.trim() || defaultLaneName(id),
    prompt: custom.prompt,
    next_step: custom.next_step.trim(),
  }
}

export function isLaunchLane(lane: string, defs?: Record<string, LaneDef>): boolean {
  if (lane === "in_progress" || lane === "review") return true
  return Boolean(defs?.[lane]?.prompt.trim())
}

export function requireLane(value: string, allowed: readonly string[]): string {
  if (!allowed.includes(value)) {
    fail(`Unknown lane '${value}'. Use ${allowed.join(", ")}.`)
  }
  return value
}

export function slugLaneId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
  if (!isLaneId(slug)) {
    fail(`Cannot derive a lane identifier from '${name}'. Pass --id.`)
  }
  return slug
}

export function looksLikePromptPath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.includes("/") || trimmed.includes("\\")) return true
  return /\.(md|txt)$/i.test(trimmed)
}

export function parseLaneIds(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [...LANES]
  if (!Array.isArray(raw)) fail("lanes must be an array of identifiers.")
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string" || !item.trim()) {
      fail("lanes must be an array of identifiers.")
    }
    const id = item.trim()
    if (!isLaneId(id)) {
      fail(`Invalid lane identifier '${id}'. Use [a-z][a-z0-9_]*.`)
    }
    if (seen.has(id)) fail(`Duplicate lane '${id}'.`)
    seen.add(id)
    ids.push(id)
  }
  if (ids.length === 0) fail("lanes must include at least one identifier.")
  return ids
}

export function parseLaneDefs(raw: unknown, laneIds: readonly string[]): Record<string, LaneDef> {
  if (raw === undefined || raw === null || raw === "") return {}
  if (typeof raw !== "object" || Array.isArray(raw)) {
    fail("lane tables must be [lane.<id>] entries.")
  }
  const rec = raw as Record<string, unknown>
  const out: Record<string, LaneDef> = {}
  const idSet = new Set(laneIds)
  for (const [id, value] of Object.entries(rec)) {
    if (!isLaneId(id)) {
      fail(`Invalid lane identifier '${id}'. Use [a-z][a-z0-9_]*.`)
    }
    if (!idSet.has(id)) {
      fail(`Lane '${id}' is defined but not listed in lanes.`)
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail(`[lane.${id}] must be a table.`)
    }
    const entry = value as Record<string, unknown>
    const name = typeof entry.name === "string" ? entry.name.trim() : ""
    const prompt = typeof entry.prompt === "string" ? entry.prompt : ""
    const next_step = typeof entry.next_step === "string" ? entry.next_step.trim() : ""
    if (next_step && !idSet.has(next_step)) {
      fail(`Unknown next_step '${next_step}' for lane '${id}'. Use ${laneIds.join(", ")}.`)
    }
    if (next_step === id) fail(`Lane '${id}' next_step cannot be itself.`)
    out[id] = {
      name: name || defaultLaneName(id),
      prompt,
      next_step,
    }
  }
  return out
}

export function insertLaneId(lanes: readonly string[], id: string, beforeId = "done"): string[] {
  if (lanes.includes(id)) fail(`Lane '${id}' already exists.`)
  const idx = lanes.indexOf(beforeId)
  if (idx === -1) return [...lanes, id]
  return [...lanes.slice(0, idx), id, ...lanes.slice(idx)]
}

export async function resolveLanePromptPath(
  boardRoot: string,
  promptsDir: string,
  prompt: string,
): Promise<string> {
  const trimmed = prompt.trim()
  const candidates = isAbsolute(trimmed)
    ? [trimmed]
    : [resolve(boardRoot, trimmed), resolve(promptsDir, trimmed), resolve(promptsDir, basename(trimmed))]
  for (const abs of candidates) {
    if (await pathExists(abs)) return abs
  }
  fail(`Lane prompt not found: ${trimmed}`)
}

export async function loadLanePromptText(paths: BoardPaths, prompt: string): Promise<string | undefined> {
  const trimmed = prompt.trim()
  if (!trimmed) return undefined
  if (looksLikePromptPath(trimmed)) {
    const path = await resolveLanePromptPath(paths.boardRoot, paths.promptsDir, trimmed)
    const text = (await readText(path)).trim()
    return text || undefined
  }
  return trimmed
}

export function buildCustomLanePrompt(text: string, taskId: string, nextStep: string): string {
  const next = nextStep.trim()
  let body = text.replaceAll("<id>", taskId).replaceAll("<next_step>", next)
  if (next && !body.includes("htasks move")) {
    body = `${body}\nWhen complete: \`htasks move ${taskId} ${next}\`.`
  }
  return body.trim()
}
