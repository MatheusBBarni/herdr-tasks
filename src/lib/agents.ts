import type { AgentEntry, Config } from "./types.ts"
import { fail } from "./errors.ts"

export const KNOWN_HERDR_KINDS = new Set([
  "pi",
  "claude",
  "codex",
  "gemini",
  "cursor",
  "devin",
  "agy",
  "cline",
  "omp",
  "mastracode",
  "opencode",
  "copilot",
  "kimi",
  "kiro",
  "droid",
  "amp",
  "grok",
  "hermes",
  "kilo",
  "qodercli",
  "qwen",
  "maki",
])

export function agentKeys(config: Config): string[] {
  return Object.keys(config.agents).sort()
}

export function requireAgent(config: Config, key: string): AgentEntry {
  const agent = config.agents[key]
  if (!agent) {
    const known = agentKeys(config)
    const list = known.length > 0 ? known.join(", ") : "(none)"
    fail(`Unknown agent '${key}'. Known: ${list}`)
  }
  if (!agent.command.trim()) {
    fail(`Agent '${key}' has an empty command in config.`)
  }
  return agent
}

export function resolveKind(key: string, entry: AgentEntry): string | undefined {
  if (entry.kind && entry.kind.trim()) return entry.kind.trim()
  if (KNOWN_HERDR_KINDS.has(key)) return key
  return undefined
}

export function parseAgentName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) fail("Agent name is required.")
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(trimmed)) {
    fail("Agent name must match [A-Za-z][A-Za-z0-9_-]{0,63}.")
  }
  return trimmed
}
