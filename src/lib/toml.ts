import type { Config } from "./types.ts"

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function isBareKey(key: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(key)
}

function tableKey(name: string): string {
  return isBareKey(name) ? `agents.${name}` : `agents.${tomlString(name)}`
}

export function stringifyConfig(config: Config): string {
  const lines = [
    `prefix = ${tomlString(config.prefix)}`,
    `default_agent = ${tomlString(config.default_agent)}`,
    `default_project = ${tomlString(config.default_project)}`,
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
    lines.push(`[${tableKey(name)}]`)
    lines.push(`command = ${tomlString(agent.command)}`)
    if (agent.kind) lines.push(`kind = ${tomlString(agent.kind)}`)
    lines.push("")
  }
  return `${lines.join("\n").trimEnd()}\n`
}

export function defaultConfigToml(opts: {
  prefix: string
  defaultAgent: string
  defaultProject: string
}): string {
  return `prefix = ${tomlString(opts.prefix)}
default_agent = ${tomlString(opts.defaultAgent)}
default_project = ${tomlString(opts.defaultProject)}
lanes = ["backlog", "in_progress", "done"]
next_id = 1

[herdr]
bin = "herdr"
# tab | workspace | pane
behavior = "workspace"

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
`
}
