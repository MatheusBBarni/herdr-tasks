import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"
import { applySettings, loadConfig, parseConfig, resolveReviewSkillPath, setConfigValue } from "./config.ts"
import { ensureDir } from "./fs.ts"
import { REVIEW_PROMPT_REL, pathsFor } from "./root.ts"
import { defaultConfigToml, stringifyConfig } from "./toml.ts"
import { EMPTY_REVIEW, type Config } from "./types.ts"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function cfg(extra = "") {
  return `
prefix = "dev"
default_agent = "claude"
default_project = ""
lanes = ["backlog", "in_progress", "review", "done"]
next_id = 1
herdr_bin = "herdr"
${extra}
[agents.claude]
command = "ccc"
kind = "claude"
`
}

function sample(partial: Partial<Config> = {}): Config {
  return {
    prefix: "dev",
    default_agent: "claude",
    default_project: "",
    theme: "nord",
    lanes: ["backlog", "in_progress", "review", "done"],
    next_id: 1,
    herdr_bin: "herdr",
    herdr_behavior: "workspace",
    agents: { claude: { command: "ccc", kind: "claude" } },
    projects: {},
    task_types: ["feat", "fix", "bug", "chore", "docs", "refactor", "test"],
    default_type: "feat",
    review: { ...EMPTY_REVIEW },
    ...partial,
  }
}

test("herdr_behavior defaults to workspace", () => {
  expect(parseConfig(cfg()).herdr_behavior).toBe("workspace")
})

test("herdr_behavior tab and pane", () => {
  expect(parseConfig(cfg('herdr_behavior = "tab"')).herdr_behavior).toBe("tab")
  expect(parseConfig(cfg('herdr_behavior = "pane"')).herdr_behavior).toBe("pane")
})

test("invalid herdr_behavior is an error", () => {
  expect(() => parseConfig(cfg('herdr_behavior = "window"'))).toThrow(/herdr\.behavior/)
})

test("parses [herdr] table", () => {
  const config = parseConfig(`
prefix = "dev"
default_agent = "claude"
next_id = 1

[herdr]
bin = "/opt/herdr"
behavior = "tab"

[agents.claude]
command = "ccc"
`)
  expect(config.herdr_bin).toBe("/opt/herdr")
  expect(config.herdr_behavior).toBe("tab")
})

test("[herdr] overrides legacy top-level keys", () => {
  const config = parseConfig(`
prefix = "dev"
default_agent = "claude"
next_id = 1
herdr_bin = "legacy-bin"
herdr_behavior = "pane"

[herdr]
bin = "nested-bin"
behavior = "tab"

[agents.claude]
command = "ccc"
`)
  expect(config.herdr_bin).toBe("nested-bin")
  expect(config.herdr_behavior).toBe("tab")
})

test("stringifyConfig writes [herdr] section", () => {
  const text = stringifyConfig(sample({ herdr_bin: "/opt/herdr", herdr_behavior: "tab" }))
  expect(text).toContain("[herdr]")
  expect(text).toContain('bin = "/opt/herdr"')
  expect(text).toContain('behavior = "tab"')
  expect(text).not.toContain("herdr_bin")
  expect(text).not.toContain("herdr_behavior")
  expect(parseConfig(text).herdr_bin).toBe("/opt/herdr")
  expect(parseConfig(text).herdr_behavior).toBe("tab")
})

test("theme defaults to nord and accepts aliases", () => {
  expect(parseConfig(cfg()).theme).toBe("nord")
  expect(parseConfig(cfg('theme = "dracula"')).theme).toBe("dracula")
  expect(parseConfig(cfg('theme = "catppuccin-light"')).theme).toBe("catppuccin_light")
  expect(parseConfig(cfg('theme = "mocha"')).theme).toBe("catppuccin")
})

test("invalid theme is an error", () => {
  expect(() => parseConfig(cfg('theme = "solarized"'))).toThrow(/Unknown theme/)
})

test("stringifyConfig writes theme", () => {
  const text = stringifyConfig(sample({ theme: "dracula" }))
  expect(text).toContain('theme = "dracula"')
  expect(parseConfig(text).theme).toBe("dracula")
})

test("setConfigValue theme canonicalizes aliases", async () => {
  const dir = await mkdtemp(join(tmpdir(), "htasks-cfg-"))
  dirs.push(dir)
  const paths = pathsFor(dir)
  await ensureDir(paths.dataDir)
  await Bun.write(paths.configPath, stringifyConfig(sample()))
  const config = await setConfigValue(paths, "theme", "catppuccin-light")
  expect(config.theme).toBe("catppuccin_light")
  expect(await Bun.file(paths.configPath).text()).toContain('theme = "catppuccin_light"')
})

test("applySettings writes theme agent behavior and bin", async () => {
  const dir = await mkdtemp(join(tmpdir(), "htasks-cfg-"))
  dirs.push(dir)
  const paths = pathsFor(dir)
  await ensureDir(paths.dataDir)
  await Bun.write(paths.configPath, stringifyConfig(sample()))
  const config = await applySettings(paths, {
    theme: "light",
    default_agent: "claude",
    default_project: dir,
    herdr_behavior: "tab",
    herdr_bin: "/opt/herdr",
  })
  expect(config.theme).toBe("light")
  expect(config.default_project).toBe(dir)
  expect(config.herdr_behavior).toBe("tab")
  expect(config.herdr_bin).toBe("/opt/herdr")
})

test("task_types default and custom list", () => {
  expect(parseConfig(cfg()).task_types).toEqual([
    "feat",
    "fix",
    "bug",
    "chore",
    "docs",
    "refactor",
    "test",
  ])
  expect(parseConfig(cfg()).default_type).toBe("feat")
  const custom = parseConfig(cfg('task_types = ["bug", "feat"]\ndefault_type = "bug"'))
  expect(custom.task_types).toEqual(["bug", "feat"])
  expect(custom.default_type).toBe("bug")
})

test("invalid default_type is an error", () => {
  expect(() => parseConfig(cfg('default_type = "epic"'))).toThrow(/Unknown default_type/)
})

test("stringifyConfig writes task_types", () => {
  const text = stringifyConfig(sample({ task_types: ["feat", "fix"], default_type: "fix" }))
  expect(text).toContain('task_types = ["feat", "fix"]')
  expect(text).toContain('default_type = "fix"')
  expect(parseConfig(text).default_type).toBe("fix")
})

test("parses [projects.*] tables", () => {
  const config = parseConfig(`
prefix = "dev"
default_agent = "claude"
next_id = 1

[agents.claude]
command = "ccc"

[projects.herdr-tasks]
name = "herdr-tasks"
path = "/repo/htasks"

[projects.other]
path = "/repo/other"
`)
  expect(config.projects).toEqual({
    "herdr-tasks": { name: "herdr-tasks", path: "/repo/htasks" },
    other: { name: "other", path: "/repo/other" },
  })
})

test("project table without path is an error", () => {
  expect(() =>
    parseConfig(`
prefix = "dev"
default_agent = "claude"
next_id = 1

[agents.claude]
command = "ccc"

[projects.broken]
name = "broken"
`),
  ).toThrow(/missing path/)
})

test("stringifyConfig writes [projects] section", () => {
  const text = stringifyConfig(
    sample({
      projects: {
        "herdr-tasks": { name: "herdr-tasks", path: "/repo/htasks" },
      },
    }),
  )
  expect(text).toContain("[projects.herdr-tasks]")
  expect(text).toContain('name = "herdr-tasks"')
  expect(text).toContain('path = "/repo/htasks"')
  expect(parseConfig(text).projects["herdr-tasks"]?.path).toBe("/repo/htasks")
})

test("stringifyConfig omits projects when empty", () => {
  expect(stringifyConfig(sample())).not.toContain("[projects")
})

test("parses [review] table", () => {
  const config = parseConfig(`
prefix = "dev"
default_agent = "claude"
next_id = 1

[agents.claude]
command = "ccc"

[review]
agent = "claude"
skill = "skills/review/SKILL.md"
prompt = "Look for regressions."
`)
  expect(config.review).toEqual({
    agent: "claude",
    skill: "skills/review/SKILL.md",
    prompt: "Look for regressions.",
  })
  expect(config.lanes).toEqual(["backlog", "in_progress", "review", "done"])
})

test("review defaults to empty and lanes are canonical", () => {
  const config = parseConfig(cfg())
  expect(config.review).toEqual({ agent: "", skill: "", prompt: "" })
  expect(config.lanes).toEqual(["backlog", "in_progress", "review", "done"])
})

test("defaultConfigToml points [review] prompt at the shipped prompt file", () => {
  const config = parseConfig(
    defaultConfigToml({ prefix: "dev", defaultAgent: "claude", defaultProject: "" }),
  )
  expect(config.review.prompt).toBe(REVIEW_PROMPT_REL)
})

test("unknown lane in config is an error", () => {
  expect(() =>
    parseConfig(`
prefix = "dev"
default_agent = "claude"
lanes = ["backlog", "later"]
next_id = 1

[agents.claude]
command = "ccc"
`),
  ).toThrow(/Unknown lane/)
})

test("stringifyConfig writes [review] section", () => {
  const text = stringifyConfig(
    sample({
      review: { agent: "pi", skill: "review.md", prompt: "Be strict." },
    }),
  )
  expect(text).toContain("[review]")
  expect(text).toContain('agent = "pi"')
  expect(text).toContain('skill = "review.md"')
  expect(text).toContain('prompt = "Be strict."')
  expect(parseConfig(text).review.agent).toBe("pi")
})

test("loadConfig rewrites legacy herdr keys into [herdr]", async () => {
  const dir = await mkdtemp(join(tmpdir(), "htasks-cfg-"))
  dirs.push(dir)
  const paths = pathsFor(dir)
  await ensureDir(paths.dataDir)
  await Bun.write(
    paths.configPath,
    `prefix = "dev"
default_agent = "claude"
default_project = ""
lanes = ["backlog", "in_progress", "done"]
next_id = 2
herdr_bin = "herdr"
herdr_behavior = "tab"

[agents.pi]
command = "pi"
kind = "pi"
`,
  )
  const config = await loadConfig(paths)
  expect(config.herdr_behavior).toBe("tab")
  const text = await Bun.file(paths.configPath).text()
  expect(text).toContain("[herdr]")
  expect(text).toContain('behavior = "tab"')
  expect(text).not.toContain("herdr_bin")
  expect(text).not.toContain("herdr_behavior")
})

test("resolveReviewSkillPath accepts a skill name from .agents/skills", async () => {
  const dir = await mkdtemp(join(tmpdir(), "htasks-skill-"))
  dirs.push(dir)
  const skillFile = join(dir, ".agents/skills/thermo-nuclear-code-quality-review/SKILL.md")
  await mkdir(join(dir, ".agents/skills/thermo-nuclear-code-quality-review"), { recursive: true })
  await Bun.write(skillFile, "# review\n")
  expect(await resolveReviewSkillPath(dir, "thermo-nuclear-code-quality-review", { home: dir })).toBe(
    skillFile,
  )
})

test("resolveReviewSkillPath still accepts a filesystem path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "htasks-skill-"))
  dirs.push(dir)
  const skillFile = join(dir, "custom/SKILL.md")
  await mkdir(join(dir, "custom"), { recursive: true })
  await Bun.write(skillFile, "# review\n")
  expect(await resolveReviewSkillPath(dir, "custom/SKILL.md", { home: dir })).toBe(skillFile)
})

test("resolveReviewSkillPath fails on an unknown skill name", async () => {
  const dir = await mkdtemp(join(tmpdir(), "htasks-skill-"))
  dirs.push(dir)
  await expect(resolveReviewSkillPath(dir, "nope-skill", { home: dir })).rejects.toThrow(
    /Review skill not found: nope-skill/,
  )
})
