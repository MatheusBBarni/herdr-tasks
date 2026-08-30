import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { requireAgent } from "./agents.ts"
import { fail } from "./errors.ts"
import { isDirectory, pathExists, readText, writeFileAtomic } from "./fs.ts"
import { pathsFor, type BoardPaths } from "./root.ts"
import { parseThemeName, type ThemeName } from "./themes.ts"
import { defaultConfigToml, stringifyConfig } from "./toml.ts"
import { parseProjects } from "./projects.ts"
import { parseDefaultType, parseTaskTypes } from "./task-types.ts"
import {
  CONFIG_KEYS,
  HERDR_BEHAVIORS,
  LANES,
  isHerdrBehavior,
  type Config,
  type ConfigKey,
  type HerdrBehavior,
  type Lane,
  type ReviewConfig,
} from "./types.ts"

type RawConfig = {
  prefix?: unknown
  default_agent?: unknown
  default_project?: unknown
  theme?: unknown
  lanes?: unknown
  next_id?: unknown
  herdr_bin?: unknown
  herdr_behavior?: unknown
  herdr?: unknown
  agents?: unknown
  projects?: unknown
  task_types?: unknown
  default_type?: unknown
  review?: unknown
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function asInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value)
    if (n >= 1) return n
  }
  return fallback
}

function parseAgents(raw: unknown): Config["agents"] {
  if (!raw || typeof raw !== "object") return {}
  const out: Config["agents"] = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue
    const entry = value as Record<string, unknown>
    const command = asString(entry.command, "")
    const kind = typeof entry.kind === "string" && entry.kind.trim() ? entry.kind.trim() : undefined
    out[key] = kind ? { command, kind } : { command }
  }
  return out
}

function herdrTable(raw: unknown): { bin?: unknown; behavior?: unknown } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const rec = raw as Record<string, unknown>
  return { bin: rec.bin, behavior: rec.behavior }
}

function parseHerdrBehavior(raw: unknown): Config["herdr_behavior"] {
  if (raw === undefined || raw === null || raw === "") return "workspace"
  if (typeof raw !== "string" || !isHerdrBehavior(raw)) {
    fail(`Invalid herdr.behavior '${String(raw)}'. Use ${HERDR_BEHAVIORS.join(", ")}.`)
  }
  return raw
}

function parseLanes(raw: unknown): Lane[] {
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item && !(LANES as readonly string[]).includes(item)) {
        fail(`Unknown lane '${item}'. Use ${LANES.join(", ")}.`)
      }
    }
  }
  return [...LANES]
}

function reviewTable(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as Record<string, unknown>
}

function parseReview(raw: unknown): ReviewConfig {
  const rec = reviewTable(raw)
  return {
    agent: asString(rec.agent, "").trim(),
    skill: asString(rec.skill, "").trim(),
    prompt: asString(rec.prompt, ""),
  }
}

export function reviewAgentKey(config: Config, taskAgent: string): string {
  return config.review.agent.trim() || taskAgent
}

function isSkillPath(value: string): boolean {
  return isAbsolute(value) || value.includes("/") || value.includes("\\") || /\.(md|txt)$/i.test(value)
}

export function reviewSkillCandidates(
  name: string,
  boardRoot: string,
  home = homedir(),
): string[] {
  const fromWalk: string[] = []
  let dir = resolve(boardRoot)
  while (true) {
    fromWalk.push(
      join(dir, ".agents/skills", name, "SKILL.md"),
      join(dir, ".claude/skills", name, "SKILL.md"),
      join(dir, ".herdr-tasks/skills", name, "SKILL.md"),
      join(dir, "skills", name, "SKILL.md"),
    )
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const fromHome = [
    join(home, ".claude/skills", name, "SKILL.md"),
    join(home, ".agents/skills", name, "SKILL.md"),
    join(home, ".pi/agent/skills", name, "SKILL.md"),
    join(home, ".codex/skills", name, "SKILL.md"),
    join(home, ".cursor/skills", name, "SKILL.md"),
    join(home, ".config/opencode/skills", name, "SKILL.md"),
  ]
  return [...fromWalk, ...fromHome]
}

async function existingSkillFile(path: string): Promise<string | undefined> {
  if (await isDirectory(path)) {
    const nested = join(path, "SKILL.md")
    if (await pathExists(nested)) return nested
    return undefined
  }
  if (await pathExists(path)) return path
  return undefined
}

export async function resolveReviewSkillPath(
  boardRoot: string,
  skill: string,
  opts: { home?: string } = {},
): Promise<string | undefined> {
  const trimmed = skill.trim()
  if (!trimmed) return undefined
  if (isSkillPath(trimmed)) {
    const abs = isAbsolute(trimmed) ? trimmed : resolve(boardRoot, trimmed)
    const found = await existingSkillFile(abs)
    if (found) return found
    fail(`Review skill not found: ${trimmed}`)
  }
  for (const candidate of reviewSkillCandidates(trimmed, boardRoot, opts.home ?? homedir())) {
    const found = await existingSkillFile(candidate)
    if (found) return found
  }
  fail(
    `Review skill not found: ${trimmed}. Use a skill name (.agents/skills/<name>/SKILL.md) or a path to SKILL.md.`,
  )
}

export async function resolveReviewPromptPath(boardRoot: string, prompt: string): Promise<string | undefined> {
  const trimmed = prompt.trim()
  if (!trimmed) return undefined
  const abs = isAbsolute(trimmed) ? trimmed : resolve(boardRoot, trimmed)
  if (!(await pathExists(abs))) {
    fail(`Review prompt not found: ${trimmed}`)
  }
  return abs
}

export async function loadReviewPromptText(boardRoot: string, prompt: string): Promise<string | undefined> {
  const path = await resolveReviewPromptPath(boardRoot, prompt)
  if (!path) return undefined
  const text = (await readText(path)).trim()
  return text || undefined
}

export function parseConfig(text: string): Config {
  let raw: RawConfig
  try {
    raw = Bun.TOML.parse(text) as RawConfig
  } catch (err) {
    fail(`Invalid config.toml: ${err instanceof Error ? err.message : String(err)}`)
  }
  const agents = parseAgents(raw.agents)
  const prefix = asString(raw.prefix, "dev").trim() || "dev"
  const default_agent = asString(raw.default_agent, Object.keys(agents)[0] ?? "claude")
  const nested = herdrTable(raw.herdr)
  const task_types = parseTaskTypes(raw.task_types)
  return {
    prefix,
    default_agent,
    default_project: asString(raw.default_project, ""),
    theme: parseThemeName(raw.theme),
    lanes: parseLanes(raw.lanes),
    next_id: asInt(raw.next_id, 1),
    herdr_bin: asString(nested.bin ?? raw.herdr_bin, "herdr").trim() || "herdr",
    herdr_behavior: parseHerdrBehavior(nested.behavior ?? raw.herdr_behavior),
    agents,
    projects: parseProjects(raw.projects),
    task_types,
    default_type: parseDefaultType(raw.default_type, task_types),
    review: parseReview(raw.review),
  }
}

export function hasLegacyHerdrKeys(text: string): boolean {
  return /^\s*herdr_(?:bin|behavior)\s*=/m.test(text)
}

export async function loadConfig(paths: BoardPaths): Promise<Config> {
  if (!(await pathExists(paths.configPath))) {
    fail(`Missing ${paths.configPath}. Run \`htasks init\`.`)
  }
  const text = await readText(paths.configPath)
  const config = parseConfig(text)
  if (hasLegacyHerdrKeys(text)) {
    await saveConfig(paths, config)
  }
  return config
}

export async function saveConfig(paths: BoardPaths, config: Config): Promise<void> {
  await writeFileAtomic(paths.configPath, stringifyConfig(config))
}

export function getConfigValue(config: Config, key: string): string {
  if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
    fail(`Unknown config key '${key}'. Known: ${CONFIG_KEYS.join(", ")}`)
  }
  const typed = key as ConfigKey
  const value = config[typed]
  return String(value)
}

export async function setConfigValue(paths: BoardPaths, key: string, value: string): Promise<Config> {
  const config = await loadConfig(paths)
  if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
    fail(`Unknown config key '${key}'. Known: ${CONFIG_KEYS.join(", ")}`)
  }
  if (key === "next_id") {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 1) fail("next_id must be a positive integer.")
    config.next_id = n
  } else if (key === "prefix") {
    if (!/^[a-z][a-z0-9_-]*$/i.test(value)) fail("prefix must match [a-z][a-z0-9_-]*.")
    config.prefix = value
  } else if (key === "default_agent") {
    requireAgent(config, value)
    config.default_agent = value
  } else if (key === "default_project") {
    config.default_project = value
  } else if (key === "theme") {
    config.theme = parseThemeName(value)
  } else if (key === "herdr_bin") {
    if (!value.trim()) fail("herdr_bin cannot be empty.")
    config.herdr_bin = value.trim()
  } else if (key === "herdr_behavior") {
    if (!isHerdrBehavior(value)) {
      fail("Invalid herdr.behavior. Use tab, workspace, or pane.")
    }
    config.herdr_behavior = value
  }
  await saveConfig(paths, config)
  return config
}

export type SettingsPatch = {
  theme: ThemeName
  default_agent: string
  default_project: string
  herdr_behavior: HerdrBehavior
  herdr_bin: string
}

export async function applySettings(paths: BoardPaths, patch: SettingsPatch): Promise<Config> {
  const config = await loadConfig(paths)
  requireAgent(config, patch.default_agent)
  config.theme = parseThemeName(patch.theme)
  config.default_agent = patch.default_agent
  config.default_project = patch.default_project.trim()
  if (!isHerdrBehavior(patch.herdr_behavior)) {
    fail(`Invalid herdr.behavior '${patch.herdr_behavior}'. Use ${HERDR_BEHAVIORS.join(", ")}.`)
  }
  config.herdr_behavior = patch.herdr_behavior
  if (!patch.herdr_bin.trim()) fail("herdr_bin cannot be empty.")
  config.herdr_bin = patch.herdr_bin.trim()
  await saveConfig(paths, config)
  return config
}

export async function writeInitConfig(
  boardRoot: string,
  opts: { prefix: string; agent: string; project: string },
): Promise<BoardPaths> {
  const paths = pathsFor(boardRoot)
  if (await pathExists(paths.configPath)) {
    fail(`Board already exists at ${paths.dataDir}`)
  }
  await writeFileAtomic(
    paths.configPath,
    defaultConfigToml({
      prefix: opts.prefix,
      defaultAgent: opts.agent,
      defaultProject: opts.project,
    }),
  )
  return paths
}

export function taskFilePath(paths: BoardPaths, id: string): string {
  return join(paths.tasksDir, `${id}.md`)
}
