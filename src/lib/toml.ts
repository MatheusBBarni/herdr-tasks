import { REVIEW_PROMPT_REL } from "./root.ts"
import type { Config } from "./types.ts"

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function isBareKey(key: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(key)
}

function mapTableKey(map: string, name: string): string {
  return isBareKey(name) ? `${map}.${name}` : `${map}.${tomlString(name)}`
}

export function stringifyConfig(config: Config): string {
  const lines = [
    `prefix = ${tomlString(config.prefix)}`,
    `theme = ${tomlString(config.theme)}`,
    `default_agent = ${tomlString(config.default_agent)}`,
    `default_project = ${tomlString(config.default_project)}`,
    `task_types = [${config.task_types.map(tomlString).join(", ")}]`,
    `default_type = ${tomlString(config.default_type)}`,
    `lanes = [${config.lanes.map(tomlString).join(", ")}]`,
    `next_id = ${config.next_id}`,
    "",
    "[herdr]",
    `bin = ${tomlString(config.herdr_bin)}`,
    `behavior = ${tomlString(config.herdr_behavior)}`,
    "",
  ]
  const names = Object.keys(config.agents).sort()
  for (const name of names) {
    const agent = config.agents[name]
    if (!agent) continue
    lines.push(`[${mapTableKey("agents", name)}]`)
    lines.push(`command = ${tomlString(agent.command)}`)
    if (agent.kind) lines.push(`kind = ${tomlString(agent.kind)}`)
    lines.push("")
  }
  const projectNames = Object.keys(config.projects).sort()
  for (const name of projectNames) {
    const project = config.projects[name]
    if (!project) continue
    lines.push(`[${mapTableKey("projects", name)}]`)
    lines.push(`name = ${tomlString(project.name)}`)
    lines.push(`path = ${tomlString(project.path)}`)
    lines.push("")
  }
  for (const id of config.lanes) {
    const def = config.lane_defs[id]
    if (!def) continue
    lines.push(`[${mapTableKey("lane", id)}]`)
    lines.push(`name = ${tomlString(def.name)}`)
    lines.push(`prompt = ${tomlString(def.prompt)}`)
    lines.push(`next_step = ${tomlString(def.next_step)}`)
    lines.push("")
  }
  lines.push("[review]")
  lines.push(`agent = ${tomlString(config.review.agent)}`)
  lines.push(`skill = ${tomlString(config.review.skill)}`)
  lines.push(`prompt = ${tomlString(config.review.prompt)}`)
  lines.push("")
  return `${lines.join("\n").trimEnd()}\n`
}

export function defaultConfigToml(opts: {
  prefix: string
  defaultAgent: string
  defaultProject: string
}): string {
  return `prefix = ${tomlString(opts.prefix)}
theme = "nord"
default_agent = ${tomlString(opts.defaultAgent)}
default_project = ${tomlString(opts.defaultProject)}
task_types = ["feat", "fix", "bug", "chore", "docs", "refactor", "test"]
default_type = "feat"
lanes = ["backlog", "in_progress", "review", "done"]
# extra columns: add an id here and a [lane.<id>] table (name, prompt, next_step)
next_id = 1

[herdr]
bin = "herdr"
# tab | workspace | pane
behavior = "workspace"

# Review lane: after in_progress, move here. Reuses the live pane; empty agent uses the task's agent.
# skill = skill name (thermo-nuclear-code-quality-review) or path to SKILL.md
# prompt = extra prompt file (absolute or relative to the board root); empty uses prompts/review.md
[review]
agent = ""
skill = ""
prompt = ${tomlString(REVIEW_PROMPT_REL)}

# name shown on cards / form = key
# command = argv started inside the Herdr pane (aliases, wrappers, flags allowed)
# kind = herdr --kind for detection (optional; default = name if herdr knows it)

[agents.claude]
command = "ccc"
kind = "claude"

[agents.grok]
command = "grok"
kind = "grok"

[agents.codex]
command = "codex"
kind = "codex"

[agents.opencode]
command = "opencode"
kind = "opencode"

# optional named projects; when present, the task form uses a select
# [projects.herdr-tasks]
# name = "herdr-tasks"
# path = "/path/to/herdr-tasks"
`
}
