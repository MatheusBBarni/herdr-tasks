import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { applySettings, loadConfig, parseConfig, setConfigValue } from "./config.ts"
import { ensureDir } from "./fs.ts"
import { pathsFor } from "./root.ts"
import { stringifyConfig } from "./toml.ts"
import type { Config } from "./types.ts"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function cfg(extra = "") {
  return `
prefix = "dev"
default_agent = "claude"
default_project = ""
lanes = ["backlog", "in_progress", "done"]
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
    lanes: ["backlog", "in_progress", "done"],
    next_id: 1,
    herdr_bin: "herdr",
    herdr_behavior: "workspace",
    agents: { claude: { command: "ccc", kind: "claude" } },
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
