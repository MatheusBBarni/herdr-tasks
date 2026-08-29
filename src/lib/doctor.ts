import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { colorEnabled, paint } from "./color.ts"
import { parseConfig } from "./config.ts"
import { isDirectory, pathExists, readText } from "./fs.ts"
import { defaultRunner, isServerRunning, type HerdrRunner } from "./herdr.ts"
import { findProject, listedProjects } from "./projects.ts"
import { findBoardRoot, packagedSkillPath, pathsFor } from "./root.ts"

export type DoctorStatus = "ok" | "warn" | "fail"

export type DoctorCheck = {
  id: string
  status: DoctorStatus
  message: string
  hint?: string
}

export type DoctorReport = {
  ok: boolean
  fails: number
  warns: number
  checks: DoctorCheck[]
}

export type DoctorEnv = {
  cwd?: string
  home?: string
  bunVersion?: string | undefined
  tty?: boolean
  which?: (command: string) => string | null
  runHerdr?: HerdrRunner
}

const MIN_BUN = "1.3.0"

export function herdrSkillCandidates(home: string, cwd: string): string[] {
  const fromHome = [
    join(home, ".claude/skills/herdr/SKILL.md"),
    join(home, ".agents/skills/herdr/SKILL.md"),
    join(home, ".pi/agent/skills/herdr/SKILL.md"),
    join(home, ".codex/skills/herdr/SKILL.md"),
    join(home, ".cursor/skills/herdr/SKILL.md"),
    join(home, ".config/opencode/skills/herdr/SKILL.md"),
  ]
  const fromWalk: string[] = []
  let dir = resolve(cwd)
  while (true) {
    fromWalk.push(
      join(dir, ".agents/skills/herdr/SKILL.md"),
      join(dir, ".claude/skills/herdr/SKILL.md"),
    )
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return [...fromHome, ...fromWalk]
}

function parseSemver(raw: string): [number, number, number] | null {
  const match = raw.trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function gte(version: string, min: string): boolean {
  const a = parseSemver(version)
  const b = parseSemver(min)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return true
}

function commandName(command: string): string {
  const token = command.trim().split(/\s+/)[0] ?? ""
  return token
}

async function existingFiles(paths: string[]): Promise<string[]> {
  const found: string[] = []
  const seen = new Set<string>()
  for (const path of paths) {
    if (seen.has(path)) continue
    seen.add(path)
    if (await pathExists(path)) found.push(path)
  }
  return found
}

export async function runDoctor(env: DoctorEnv = {}): Promise<DoctorReport> {
  const cwd = env.cwd ?? process.cwd()
  const home = env.home ?? homedir()
  const bunVersion = env.bunVersion ?? process.versions.bun
  const tty = env.tty ?? Boolean(process.stdin.isTTY && process.stdout.isTTY)
  const which = env.which ?? ((command: string) => Bun.which(command))
  const runHerdr = env.runHerdr ?? defaultRunner
  const checks: DoctorCheck[] = []

  const add = (check: DoctorCheck) => {
    checks.push(check)
  }

  if (!bunVersion) {
    add({
      id: "bun",
      status: "fail",
      message: "not running on Bun",
      hint: "Install Bun >= 1.3 from https://bun.sh",
    })
  } else if (!gte(bunVersion, MIN_BUN)) {
    add({
      id: "bun",
      status: "fail",
      message: `Bun ${bunVersion} is too old`,
      hint: `Need Bun >= ${MIN_BUN}`,
    })
  } else {
    add({ id: "bun", status: "ok", message: `Bun ${bunVersion}` })
  }

  const boardRoot = await findBoardRoot(cwd)
  let herdrBin = "herdr"
  if (boardRoot) {
    const paths = pathsFor(boardRoot)
    add({ id: "board", status: "ok", message: `board ${paths.dataDir}` })
    try {
      const config = parseConfig(await readText(paths.configPath))
      herdrBin = config.herdr_bin || "herdr"
      add({
        id: "config",
        status: "ok",
        message: `config prefix=${config.prefix} agent=${config.default_agent} herdr_behavior=${config.herdr_behavior}`,
      })
      if (!config.agents[config.default_agent]) {
        add({
          id: "default_agent",
          status: "fail",
          message: `default_agent '${config.default_agent}' is not in the agent map`,
          hint: "htasks agents add <name> --command \"...\"",
        })
      }
      const keys = Object.keys(config.agents)
      if (keys.length === 0) {
        add({
          id: "agents",
          status: "fail",
          message: "no agents in config",
          hint: "htasks agents add <name> --command \"...\"",
        })
      } else {
        add({ id: "agents", status: "ok", message: `agents ${keys.join(", ")}` })
        for (const key of keys.sort()) {
          const entry = config.agents[key]
          if (!entry?.command.trim()) {
            add({
              id: `agent.${key}`,
              status: "fail",
              message: `agent '${key}' has an empty command`,
            })
            continue
          }
          const bin = commandName(entry.command)
          if (bin.includes("/") || bin.includes("\\")) {
            const abs = resolve(cwd, bin)
            if (await pathExists(abs)) {
              add({ id: `agent.${key}`, status: "ok", message: `${key} -> ${entry.command}` })
            } else {
              add({
                id: `agent.${key}`,
                status: "warn",
                message: `${key} command path not found: ${bin}`,
              })
            }
          } else {
            const resolved = which(bin)
            if (resolved) {
              add({ id: `agent.${key}`, status: "ok", message: `${key} -> ${entry.command}` })
            } else {
              add({
                id: `agent.${key}`,
                status: "warn",
                message: `${key} command '${bin}' not on PATH`,
                hint: "Aliases are fine if the Herdr pane's shell has them.",
              })
            }
          }
        }
      }
      const projects = listedProjects(config)
      if (projects.length > 0) {
        add({ id: "projects", status: "ok", message: `projects ${projects.map((project) => project.key).join(", ")}` })
        for (const project of projects) {
          if (await isDirectory(resolve(project.path))) {
            add({
              id: `project.${project.key}`,
              status: "ok",
              message: `${project.name} -> ${project.path}`,
            })
          } else {
            add({
              id: `project.${project.key}`,
              status: "warn",
              message: `${project.key} path does not exist: ${project.path}`,
            })
          }
        }
      }
      if (config.default_project.trim()) {
        const resolved = findProject(config, config.default_project)?.path ?? config.default_project
        if (await isDirectory(resolve(resolved))) {
          add({ id: "default_project", status: "ok", message: `default_project ${resolved}` })
        } else {
          add({
            id: "default_project",
            status: "warn",
            message: `default_project does not exist: ${resolved}`,
          })
        }
      }
      if (await pathExists(paths.skillPath)) {
        add({ id: "htasks_skill", status: "ok", message: `htasks skill ${paths.skillPath}` })
      } else {
        add({
          id: "htasks_skill",
          status: "warn",
          message: "board skill missing (.herdr-tasks/skills/htasks/SKILL.md)",
          hint: "Re-run htasks init or copy skills/htasks/SKILL.md",
        })
      }
      if (await isDirectory(paths.tasksDir)) {
        add({ id: "tasks", status: "ok", message: `tasks dir ${paths.tasksDir}` })
      } else {
        add({
          id: "tasks",
          status: "warn",
          message: "tasks directory missing",
          hint: "htasks init",
        })
      }
    } catch (err) {
      add({
        id: "config",
        status: "fail",
        message: err instanceof Error ? err.message : String(err),
      })
    }
  } else {
    add({
      id: "board",
      status: "warn",
      message: "no htasks board in this directory",
      hint: "htasks init",
    })
  }

  const herdrPath = which(herdrBin)
  if (!herdrPath) {
    add({
      id: "herdr",
      status: "fail",
      message: `'${herdrBin}' not on PATH`,
      hint: "Install herdr separately: https://herdr.dev",
    })
  } else {
    const version = await runHerdr(herdrBin, ["--version"])
    if (version.code !== 0) {
      add({
        id: "herdr",
        status: "fail",
        message: `${herdrBin} failed --version`,
        hint: version.stderr.trim() || version.stdout.trim(),
      })
    } else {
      add({
        id: "herdr",
        status: "ok",
        message: `${version.stdout.trim() || herdrBin}  ${herdrPath}`,
      })
      const status = await runHerdr(herdrBin, ["status", "--json"])
      let running = false
      if (status.code === 0) {
        try {
          running = isServerRunning(JSON.parse(status.stdout))
        } catch {
          running = false
        }
      }
      if (running) {
        add({ id: "herdr_server", status: "ok", message: "herdr server running" })
      } else {
        add({
          id: "herdr_server",
          status: "warn",
          message: "herdr server not running",
          hint: "Start herdr once in a terminal. htasks move will try to start it.",
        })
      }
    }
  }

  const skillPaths = await existingFiles(herdrSkillCandidates(home, cwd))
  if (skillPaths.length > 0) {
    for (const path of skillPaths) {
      add({ id: "herdr_skill", status: "ok", message: `herdr skill ${path}` })
    }
  } else {
    add({
      id: "herdr_skill",
      status: "warn",
      message: "herdr skill not found in ~/.claude/skills, ~/.agents/skills, ~/.pi/agent/skills, …",
      hint: "Install the Herdr skill so agents can control panes. herdr --skill prints the bundled copy.",
    })
  }

  const packaged = packagedSkillPath()
  if (await pathExists(packaged)) {
    add({ id: "packaged_skill", status: "ok", message: `packaged htasks skill ${packaged}` })
  } else {
    add({
      id: "packaged_skill",
      status: "fail",
      message: "packaged skills/htasks/SKILL.md missing",
    })
  }

  if (tty) {
    add({ id: "tty", status: "ok", message: "terminal is a TTY (board can run)" })
  } else {
    add({
      id: "tty",
      status: "warn",
      message: "no TTY; htasks board needs a terminal",
    })
  }

  const fails = checks.filter((check) => check.status === "fail").length
  const warns = checks.filter((check) => check.status === "warn").length
  return { ok: fails === 0, fails, warns, checks }
}

export function formatDoctorReport(report: DoctorReport, color = colorEnabled(process.stdout)): string {
  const label = (status: DoctorStatus) => {
    const word = status === "ok" ? "ok  " : status === "warn" ? "warn" : "fail"
    if (status === "ok") return paint(color, "green", word)
    if (status === "warn") return paint(color, "yellow", word)
    return paint(color, "red", word)
  }
  const lines: string[] = []
  for (const check of report.checks) {
    lines.push(`${label(check.status)}  ${check.message}`)
    if (check.hint && check.status !== "ok") {
      lines.push(`      ${check.hint}`)
    }
  }
  const summary = report.ok
    ? `${report.checks.filter((c) => c.status === "ok").length} ok, ${report.warns} warn`
    : `${report.fails} fail, ${report.warns} warn`
  lines.push("")
  lines.push(summary)
  return lines.join("\n")
}
