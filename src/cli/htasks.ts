#!/usr/bin/env bun

import { Command, CommanderError } from "commander"
import { parseAgentName, requireAgent } from "../lib/agents.ts"
import { colorEnabled, paint } from "../lib/color.ts"
import { createLane, getConfigValue, loadConfig, saveConfig, setConfigValue } from "../lib/config.ts"
import { formatDoctorReport, runDoctor } from "../lib/doctor.ts"
import { CliError } from "../lib/errors.ts"
import { parseBlockersInput } from "../lib/blockers.ts"
import { normalizeWorktree } from "../lib/worktree.ts"
import { moveTask } from "../lib/move.ts"
import { findBoardRoot, requireBoardRoot } from "../lib/root.ts"
import {
  createTask,
  editTask,
  getTask,
  initBoard,
  listTasks,
  requireLane,
} from "../lib/store.ts"
import { formatTable } from "../lib/table.ts"
import { basename } from "../lib/text.ts"
import type { Task } from "../lib/types.ts"
import pkg from "../../package.json" with { type: "json" }


function writeOut(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
}

function writeErr(text: string): void {
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`)
}

function taskJson(task: Task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    order: task.order,
    type: task.type,
    agent: task.agent,
    effort: task.effort,
    project: task.project,
    created: task.created,
    updated: task.updated,
    herdr: task.herdr,
    blockers: task.blockers,
    worktree: task.worktree,
    path: task.filePath,
    body: task.body,
  }
}

function printTaskTable(tasks: Task[]): void {
  if (tasks.length === 0) {
    writeOut("No tasks.")
    return
  }
  const color = colorEnabled(process.stdout)
  const rows = tasks.map((task) => ({
    id: task.id,
    status: paint(
      color,
      task.status === "done"
        ? "green"
        : task.status === "in_progress"
          ? "yellow"
          : task.status === "review"
            ? "cyan"
            : "dim",
      task.status,
    ),
    type: task.type,
    agent: task.agent,
    project: basename(task.project),
    title: task.title,
  }))
  writeOut(
    formatTable(
      [
        { key: "id", header: "ID", min: 6 },
        { key: "status", header: "STATUS", min: 8 },
        { key: "type", header: "TYPE", min: 4 },
        { key: "agent", header: "AGENT", min: 6 },
        { key: "project", header: "PROJECT", min: 6 },
        { key: "title", header: "TITLE", min: 8, flex: true },
      ],
      rows,
    ),
  )
}

async function run(): Promise<void> {
  const program = new Command()
  program
    .name("htasks")
    .description("Kanban task runner for Herdr (CLI + TUI)")
    .version(pkg.version)
    .showHelpAfterError()
    .addHelpText(
      "after",
      `
Examples:
  $ htasks init --prefix dev --agent claude
  $ htasks create --title "Add login"
  $ htasks create lane --name QA --prompt prompts/qa.md --next-step done
  $ htasks list --json
  $ htasks move dev-1 in_progress
  $ htasks doctor
  $ htasks board
`,
    )

  program
    .command("init")
    .description("Create .herdr-tasks/ in the current directory")
    .option("--prefix <prefix>", "task id prefix", "dev")
    .option("--agent <key>", "default agent map key", "claude")
    .option("--project <path>", "default project path", "")
    .action(async (opts: { prefix: string; agent: string; project: string }) => {
      const cwd = process.cwd()
      const existing = await findBoardRoot(cwd)
      if (existing === cwd) {
        throw new CliError(`Board already exists at ${cwd}/.herdr-tasks`)
      }
      const paths = await initBoard(cwd, opts)
      writeOut(`Initialized ${paths.dataDir}`)
    })

  program
    .command("board")
    .description("Open the Kanban TUI")
    .action(async () => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new CliError("htasks board needs a terminal.")
      }
      const { runBoard } = await import("../tui/index.tsx")
      await runBoard()
    })

  program
    .command("list")
    .description("List tasks")
    .option("--status <lane>", "filter by lane")
    .option("--json", "JSON on stdout")
    .action(async (opts: { status?: string; json?: boolean }) => {
      const paths = await requireBoardRoot()
      let tasks = await listTasks(paths)
      if (opts.status) {
        const config = await loadConfig(paths)
        const lane = requireLane(opts.status, config.lanes)
        tasks = tasks.filter((task) => task.status === lane)
      }
      if (opts.json) {
        writeOut(JSON.stringify(tasks.map(taskJson), null, 2))
        return
      }
      printTaskTable(tasks)
    })

  program
    .command("show")
    .description("Show one task")
    .argument("<id>", "task id")
    .option("--json", "JSON on stdout")
    .action(async (id: string, opts: { json?: boolean }) => {
      const paths = await requireBoardRoot()
      const task = await getTask(paths, id)
      if (opts.json) {
        writeOut(JSON.stringify(taskJson(task), null, 2))
        return
      }
      const color = colorEnabled(process.stdout)
      writeOut(`${paint(color, "bold", task.id)}  ${task.title}`)
      writeOut(`status   ${task.status}`)
      if (task.type) writeOut(`type     ${task.type}`)
      writeOut(`agent    ${task.agent}`)
      if (task.effort) writeOut(`effort   ${task.effort}`)
      writeOut(`project  ${task.project}`)
      if (task.blockers.length > 0) writeOut(`blockers ${task.blockers.join(", ")}`)
      if (task.worktree) writeOut("worktree yes")
      writeOut(`path     ${task.filePath}`)
      writeOut(`updated  ${task.updated}`)
      if (task.herdr.pane_id) writeOut(`pane     ${task.herdr.pane_id}`)
      if (task.body.trim()) {
        writeOut("")
        writeOut(task.body.replace(/\n+$/, ""))
      }
    })

  const createCmd = program.command("create").description("Create a task or lane")

  createCmd
    .command("lane")
    .description("Add a custom board lane")
    .requiredOption("--name <name>", "name shown on the board")
    .option("--id <identifier>", "status identifier stored on tasks (default: slug of name)")
    .option("--prompt <text-or-file>", "prompt file in prompts/ or inline text")
    .option("--next-step <lane>", "lane to move to when this lane finishes", "done")
    .action(
      async (opts: { name: string; id?: string; prompt?: string; nextStep: string }) => {
        const paths = await requireBoardRoot()
        const lane = await createLane(paths, {
          name: opts.name,
          id: opts.id,
          prompt: opts.prompt,
          next_step: opts.nextStep,
        })
        writeOut(lane.id)
      },
    )

  createCmd
    .option("--title <title>", "task title")
    .option("--description <text>", "markdown body")
    .option("--type <type>", "task type from config task_types")
    .option("--agent <key>", "agent map key")
    .option("--effort <level>", "agent effort: low, medium, high, xhigh, max")
    .option("--project <path|key>", "project path or config project key")
    .option("--status <lane>", "initial lane", "backlog")
    .option("--blockers <ids>", "comma-separated blocker task ids")
    .option("--worktree <yes|no>", "create a git worktree when moving to in_progress")
    .action(
      async (opts: {
        title?: string
        description?: string
        type?: string
        agent?: string
        effort?: string
        project?: string
        status: string
        blockers?: string
        worktree?: string
      }) => {
        if (!opts.title?.trim()) {
          throw new CliError("required option '--title <title>' not specified")
        }
        const paths = await requireBoardRoot()
        const task = await createTask(paths, {
          title: opts.title,
          description: opts.description,
          type: opts.type,
          agent: opts.agent,
          effort: opts.effort,
          project: opts.project,
          status: opts.status,
          blockers: opts.blockers !== undefined ? parseBlockersInput(opts.blockers) : undefined,
          worktree: opts.worktree !== undefined ? normalizeWorktree(opts.worktree) : undefined,
        })
        writeOut(task.id)
      },
    )

  program
    .command("move")
    .description("Move a task to a lane")
    .argument("<id>", "task id")
    .argument("<lane>", "configured lane identifier")
    .action(async (id: string, lane: string) => {
      const paths = await requireBoardRoot()
      const task = await moveTask(paths, id, lane)
      writeOut(`${task.id} ${task.status}`)
    })

  program
    .command("edit")
    .description("Edit a task")
    .argument("<id>", "task id")
    .option("--title <title>")
    .option("--description <text>")
    .option("--type <type>")
    .option("--agent <key>")
    .option("--effort <level>", "agent effort: low, medium, high, xhigh, max (none to clear)")
    .option("--project <path|key>", "project path or config project key")
    .option("--blockers <ids>", "comma-separated blocker task ids (empty or none to clear)")
    .option("--worktree <yes|no>", "create a git worktree when moving to in_progress")
    .action(
      async (
        id: string,
        opts: {
          title?: string
          description?: string
          type?: string
          agent?: string
          effort?: string
          project?: string
          blockers?: string
          worktree?: string
        },
      ) => {
        const paths = await requireBoardRoot()
        const task = await editTask(paths, id, {
          title: opts.title,
          description: opts.description,
          type: opts.type,
          agent: opts.agent,
          effort: opts.effort,
          project: opts.project,
          blockers: opts.blockers !== undefined ? parseBlockersInput(opts.blockers) : undefined,
          worktree: opts.worktree !== undefined ? normalizeWorktree(opts.worktree) : undefined,
        })
        writeOut(task.id)
      },
    )

  program
    .command("path")
    .description("Print the task markdown path")
    .argument("<id>", "task id")
    .action(async (id: string) => {
      const paths = await requireBoardRoot()
      const task = await getTask(paths, id)
      writeOut(task.filePath)
    })

  program
    .command("root")
    .description("Print the board root (directory that contains .herdr-tasks)")
    .action(async () => {
      const paths = await requireBoardRoot()
      writeOut(paths.boardRoot)
    })

  program
    .command("doctor")
    .description("Check herdr, skills, board, and TUI dependencies")
    .option("--json", "JSON on stdout")
    .action(async (opts: { json?: boolean }) => {
      const report = await runDoctor()
      if (opts.json) {
        writeOut(JSON.stringify(report, null, 2))
      } else {
        writeOut(formatDoctorReport(report))
      }
      if (!report.ok) process.exitCode = 1
    })

  const configCmd = program.command("config").description("Get or set config keys")

  configCmd
    .command("get")
    .description("Get a config value")
    .argument("<key>", "prefix | theme | default_agent | default_project | next_id | herdr_bin | herdr_behavior")
    .action(async (key: string) => {
      const paths = await requireBoardRoot()
      const config = await loadConfig(paths)
      writeOut(getConfigValue(config, key))
    })

  configCmd
    .command("set")
    .description("Set a config value")
    .argument("<key>")
    .argument("<value>")
    .action(async (key: string, value: string) => {
      const paths = await requireBoardRoot()
      await setConfigValue(paths, key, value)
      writeOut(`${key}=${value}`)
    })

  const agentsCmd = program.command("agents").description("List or manage agent map entries")

  agentsCmd.action(async () => {
    const paths = await requireBoardRoot()
    const config = await loadConfig(paths)
    const names = Object.keys(config.agents).sort()
    if (names.length === 0) {
      writeOut("No agents.")
      return
    }
    const rows = names.map((name) => {
      const entry = config.agents[name]
      return {
        name,
        command: entry?.command ?? "",
        kind: entry?.kind ?? "",
      }
    })
    writeOut(
      formatTable(
        [
          { key: "name", header: "NAME", min: 6 },
          { key: "command", header: "COMMAND", min: 6, flex: true },
          { key: "kind", header: "KIND", min: 4 },
        ],
        rows,
      ),
    )
  })

  agentsCmd
    .command("add")
    .description("Add an agent map entry")
    .argument("<name>", "map key shown on cards")
    .requiredOption("--command <cmd>", "shell command started in the Herdr pane")
    .option("--kind <herdr-kind>", "herdr --kind for detection")
    .action(async (name: string, opts: { command: string; kind?: string }) => {
      const paths = await requireBoardRoot()
      const config = await loadConfig(paths)
      const key = parseAgentName(name)
      if (config.agents[key]) {
        throw new CliError(`Agent '${key}' already exists. Remove it first, or edit config.toml.`)
      }
      config.agents[key] = opts.kind
        ? { command: opts.command, kind: opts.kind }
        : { command: opts.command }
      await saveConfig(paths, config)
      writeOut(key)
    })

  agentsCmd
    .command("remove")
    .description("Remove an agent map entry")
    .argument("<name>")
    .action(async (name: string) => {
      const paths = await requireBoardRoot()
      const config = await loadConfig(paths)
      requireAgent(config, name)
      if (config.default_agent === name) {
        throw new CliError(`Cannot remove default_agent '${name}'. Set another default_agent first.`)
      }
      delete config.agents[name]
      await saveConfig(paths, config)
      writeOut(`removed ${name}`)
    })

  if (process.argv.length <= 2) {
    program.outputHelp()
    return
  }

  await program.parseAsync(process.argv)
}

try {
  await run()
} catch (err) {
  if (err instanceof CliError) {
    writeErr(err.message)
    process.exit(err.exitCode)
  }
  if (err instanceof CommanderError) {
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
      process.exit(0)
    }
    writeErr(err.message)
    process.exit(err.exitCode === 0 ? 1 : err.exitCode)
  }
  writeErr(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
