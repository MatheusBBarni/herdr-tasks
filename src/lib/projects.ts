import type { Config, ProjectEntry } from "./types.ts"
import { fail } from "./errors.ts"

export type ListedProject = {
  key: string
  name: string
  path: string
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function isBareProjectRef(value: string): boolean {
  return !value.includes("/") && !value.includes("\\") && !/^[A-Za-z]:/.test(value)
}

export function parseProjects(raw: unknown): Record<string, ProjectEntry> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, ProjectEntry> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    const path = asString(entry.path, "").trim()
    if (!path) fail(`Project '${key}' is missing path.`)
    const name = asString(entry.name, "").trim() || key
    out[key] = { name, path }
  }
  return out
}

export function listedProjects(config: Config): ListedProject[] {
  return Object.keys(config.projects)
    .sort()
    .flatMap((key) => {
      const entry = config.projects[key]
      if (!entry) return []
      return [{ key, name: entry.name, path: entry.path }]
    })
}

export function hasProjectList(config: Config): boolean {
  return listedProjects(config).length > 0
}

export function findProject(config: Config, value: string): ListedProject | undefined {
  const raw = value.trim()
  if (!raw) return undefined
  const projects = listedProjects(config)
  return projects.find((project) => project.key === raw) ?? projects.find((project) => project.path === raw)
}

export function resolveProjectInput(
  config: Config,
  value: string | undefined,
  fallback: string,
): string {
  const raw = (value ?? "").trim()
  if (!raw) {
    const fb = fallback.trim()
    return findProject(config, fb)?.path ?? fb
  }
  const match = findProject(config, raw)
  if (match) return match.path
  if (hasProjectList(config) && isBareProjectRef(raw)) {
    const known = listedProjects(config).map((project) => project.key)
    fail(`Unknown project '${raw}'. Known: ${known.join(", ")}`)
  }
  return raw
}

export function defaultProjectPath(config: Config, cwd: string): string {
  const fromDefault = resolveProjectInput(config, config.default_project, "")
  if (fromDefault) return fromDefault
  const projects = listedProjects(config)
  if (projects.length === 0) return cwd
  return projects.find((project) => project.path === cwd)?.path ?? projects[0]?.path ?? cwd
}
