import { requireAgent } from "./agents.ts"
import { loadConfig } from "./config.ts"
import { fail } from "./errors.ts"
import {
  defaultRunner,
  HerdrError,
  herdrPaneAlive,
  launchInProgress,
  type HerdrRunner,
} from "./herdr.ts"
import { resolveProjectPath, type BoardPaths } from "./root.ts"
import { formatBlockedError } from "./blockers.ts"
import { getTask, listTasks, requireLane, saveTask, writeTask } from "./store.ts"
import type { Lane, Task } from "./types.ts"

export type MoveResult = {
  task: Task
  warning?: string
}

const emptyHerdr = {
  workspace_id: null,
  pane_id: null,
  agent_name: null,
} as const

export async function moveTask(
  paths: BoardPaths,
  id: string,
  laneRaw: string,
  opts: { runner?: HerdrRunner; launch?: boolean } = {},
): Promise<Task> {
  const { task } = await moveTaskDetailed(paths, id, laneRaw, opts)
  return task
}

export async function moveTaskDetailed(
  paths: BoardPaths,
  id: string,
  laneRaw: string,
  opts: { runner?: HerdrRunner; launch?: boolean } = {},
): Promise<MoveResult> {
  const lane = requireLane(laneRaw)
  const config = await loadConfig(paths)
  const previous = await getTask(paths, id)
  const runner = opts.runner ?? defaultRunner

  if (previous.status === lane && lane !== "in_progress") {
    return { task: previous }
  }

  if (lane === "in_progress" && previous.status !== "in_progress") {
    const tasks = await listTasks(paths)
    const blocked = formatBlockedError(previous.id, tasks, previous.blockers)
    if (blocked) fail(blocked)
  }

  const next: Task = {
    ...previous,
    status: lane,
    updated: new Date().toISOString(),
  }
  await writeTask(next)

  if (lane !== "in_progress") return { task: next }

  if (next.herdr.pane_id) {
    const alive = await herdrPaneAlive(config.herdr_bin, next.herdr.pane_id, runner)
    if (alive) return { task: next }
    next.herdr = { ...emptyHerdr }
    next.updated = new Date().toISOString()
    await writeTask(next)
  }

  if (opts.launch === false) return { task: next }

  try {
    return await completeInProgressLaunch(paths, next, { runner, config })
  } catch (err) {
    await writeTask(previous)
    if (err instanceof HerdrError) fail(err.message)
    if (err instanceof Error && err.name === "CliError") throw err
    fail(err instanceof Error ? err.message : String(err))
  }
}

export async function completeInProgressLaunch(
  paths: BoardPaths,
  task: Task,
  opts: { runner?: HerdrRunner; config?: Awaited<ReturnType<typeof loadConfig>> } = {},
): Promise<MoveResult> {
  const config = opts.config ?? (await loadConfig(paths))
  const agent = requireAgent(config, task.agent)
  const project = await resolveProjectPath(paths.boardRoot, task.project)
  const launched = await launchInProgress({
    bin: config.herdr_bin,
    task: { ...task, project, filePath: task.filePath },
    agent,
    agentKey: task.agent,
    skillPath: paths.skillPath,
    behavior: config.herdr_behavior,
    runner: opts.runner,
    boardRoot: paths.boardRoot,
  })
  task.project = project
  task.herdr = launched.herdr
  task.status = "in_progress"
  const saved = await saveTask(task)
  return { task: saved, warning: launched.warning }
}

export function laneLabel(lane: Lane): string {
  switch (lane) {
    case "backlog":
      return "Backlog"
    case "in_progress":
      return "In Progress"
    case "done":
      return "Done"
  }
}
