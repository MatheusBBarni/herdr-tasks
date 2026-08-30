import { afterEach, expect, test } from "bun:test"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatDoctorReport, herdrSkillCandidates, runDoctor } from "./doctor.ts"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function tempDir() {
  const dir = join(tmpdir(), `htasks-doctor-${crypto.randomUUID()}`)
  await mkdir(dir, { recursive: true })
  dirs.push(dir)
  return dir
}

test("herdrSkillCandidates covers claude agents and pi", () => {
  const paths = herdrSkillCandidates("/home/me", "/home/me/proj")
  expect(paths.some((path) => path.includes("/.claude/skills/herdr/SKILL.md"))).toBe(true)
  expect(paths.some((path) => path.includes("/.agents/skills/herdr/SKILL.md"))).toBe(true)
  expect(paths.some((path) => path.includes("/.pi/agent/skills/herdr/SKILL.md"))).toBe(true)
})

test("doctor fails when herdr is missing", async () => {
  const cwd = await tempDir()
  const home = await tempDir()
  const report = await runDoctor({
    env: {},
    cwd,
    home,
    bunVersion: "1.3.13",
    tty: true,
    which: () => null,
    runHerdr: async () => ({ code: 1, stdout: "", stderr: "nope" }),
  })
  expect(report.ok).toBe(false)
  expect(report.checks.some((check) => check.id === "herdr" && check.status === "fail")).toBe(true)
  expect(report.checks.some((check) => check.id === "board" && check.status === "warn")).toBe(true)
  expect(report.checks.some((check) => check.id === "tui_deps")).toBe(false)
})

test("doctor finds herdr skill and running server", async () => {
  const cwd = await tempDir()
  const home = await tempDir()
  const skill = join(home, ".claude/skills/herdr")
  await mkdir(skill, { recursive: true })
  await writeFile(join(skill, "SKILL.md"), "# herdr\n")
  const report = await runDoctor({
    env: {},
    cwd,
    home,
    bunVersion: "1.3.13",
    tty: false,
    which: (command) => (command === "herdr" ? "/usr/bin/herdr" : null),
    runHerdr: async (_bin, args) => {
      if (args[0] === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" }
      if (args[0] === "status") {
        return {
          code: 0,
          stdout: JSON.stringify({ server: { running: true, status: "running" } }),
          stderr: "",
        }
      }
      return { code: 1, stdout: "", stderr: "unexpected" }
    },
  })
  expect(report.checks.some((check) => check.id === "herdr" && check.status === "ok")).toBe(true)
  expect(report.checks.some((check) => check.id === "herdr_server" && check.status === "ok")).toBe(true)
  expect(report.checks.some((check) => check.id === "herdr_skill" && check.status === "ok")).toBe(true)
  expect(report.checks.some((check) => check.id === "tty" && check.status === "warn")).toBe(true)
  const text = formatDoctorReport(report, false)
  expect(text).toContain("ok")
  expect(text).toContain("herdr skill")
  expect(text.includes("OpenTUI")).toBe(false)
})

test("old bun is a failure", async () => {
  const cwd = await tempDir()
  const home = await tempDir()
  const report = await runDoctor({
    env: {},
    cwd,
    home,
    bunVersion: "1.2.0",
    tty: true,
    which: () => "/usr/bin/herdr",
    runHerdr: async () => ({ code: 0, stdout: "herdr 0.8.2", stderr: "" }),
  })
  expect(report.ok).toBe(false)
  expect(report.checks.some((check) => check.id === "bun" && check.status === "fail")).toBe(true)
})

test("doctor treats HERDR_ENV as a running server and notes a linked plugin", async () => {
  const cwd = await tempDir()
  const home = await tempDir()
  const calls: string[][] = []
  const report = await runDoctor({
    env: { HERDR_ENV: "1" },
    cwd,
    home,
    bunVersion: "1.3.13",
    tty: true,
    which: (command) => (command === "herdr" ? "/usr/bin/herdr" : null),
    runHerdr: async (_bin, args) => {
      calls.push(args)
      if (args[0] === "--version") return { code: 0, stdout: "herdr 0.8.2\n", stderr: "" }
      if (args[0] === "plugin") {
        return {
          code: 0,
          stdout: JSON.stringify({ result: { plugins: [{ plugin_id: "htasks" }] } }),
          stderr: "",
        }
      }
      return { code: 1, stdout: "", stderr: "unexpected" }
    },
  })
  expect(report.checks.some((check) => check.id === "herdr" && check.status === "ok")).toBe(true)
  expect(
    report.checks.some(
      (check) => check.id === "herdr_server" && check.message.includes("HERDR_ENV=1"),
    ),
  ).toBe(true)
  expect(report.checks.some((check) => check.id === "plugin" && check.status === "ok")).toBe(true)
  expect(calls.some((args) => args[0] === "status")).toBe(false)
})
