import type { ThemeName } from "./themes.ts"

export const LANES = ["backlog", "in_progress", "done"] as const
export type Lane = (typeof LANES)[number]

export const HERDR_BEHAVIORS = ["tab", "workspace", "pane"] as const
export type HerdrBehavior = (typeof HERDR_BEHAVIORS)[number]

export function isHerdrBehavior(value: string): value is HerdrBehavior {
  return (HERDR_BEHAVIORS as readonly string[]).includes(value)
}

export type AgentEntry = {
  command: string
  kind?: string
}

export type Config = {
  prefix: string
  default_agent: string
  default_project: string
  theme: ThemeName
  lanes: Lane[]
  next_id: number
  herdr_bin: string
  herdr_behavior: HerdrBehavior
  agents: Record<string, AgentEntry>
  task_types: string[]
  default_type: string
}

export type HerdrMeta = {
  workspace_id: string | null
  pane_id: string | null
  agent_name: string | null
}

export type Task = {
  id: string
  title: string
  status: Lane
  type: string
  agent: string
  project: string
  created: string
  updated: string
  herdr: HerdrMeta
  body: string
  filePath: string
}

export type TaskInput = {
  title: string
  description?: string
  type?: string
  agent?: string
  project?: string
  status?: Lane
}

export type TaskPatch = {
  title?: string
  description?: string
  type?: string
  agent?: string
  project?: string
}

export const CONFIG_KEYS = [
  "prefix",
  "theme",
  "default_agent",
  "default_project",
  "next_id",
  "herdr_bin",
  "herdr_behavior",
] as const

export type ConfigKey = (typeof CONFIG_KEYS)[number]
