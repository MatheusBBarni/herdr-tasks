import { requireAgent } from "./agents.ts"
import { loadConfig, loadReviewPromptText, resolveReviewSkillPath, reviewAgentKey } from "./config.ts"
import { fail } from "./errors.ts"
import {
  defaultRunner,
  HerdrError,
  herdrPaneAlive,
  launchInProgress,
  reviewPrompt,
  type HerdrRunner,
} from "./herdr.ts"
import { resolveProjectPath, type BoardPaths } from "./root.ts"
import { formatBlockedError } from "./blockers.ts"
import { getTask, listTasks, requireLane, saveTask, writeTask } from "./store.ts"
import { isLaunchLane, type Lane, type Task } from "./types.ts"

export type MoveResult = {
  task: Task
  warning?: string
  pendingLaunch?: "in_progress" | "review"
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

  if (previous.status === lane && !isLaunchLane(lane)) {
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

  if (!isLaunchLane(lane)) return { task: next }

  const reusePane =
    lane === "review" ? previous.status === "review" && Boolean(next.herdr.pane_id) : Boolean(next.herdr.pane_id)
  if (reusePane && next.herdr.pane_id) {
    const alive = await herdrPaneAlive(config.herdr_bin, next.herdr.pane_id, runner)
    if (alive) return { task: next }
    next.herdr = { ...emptyHerdr }
    next.updated = new Date().toISOString()
    await writeTask(next)
  }

  if (opts.launch === false) return { task: next, pendingLaunch: lane }

  try {
    if (lane === "review") return await completeReviewLaunch(paths, next, { runner, config })
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

export async function completeReviewLaunch(
  paths: BoardPaths,
  task: Task,
  opts: { runner?: HerdrRunner; config?: Awaited<ReturnType<typeof loadConfig>> } = {},
): Promise<MoveResult> {
  const config = opts.config ?? (await loadConfig(paths))
  const agentKey = reviewAgentKey(config, task.agent)
  const agent = requireAgent(config, agentKey)
  const project = await resolveProjectPath(paths.boardRoot, task.project)
  await resolveReviewSkillPath(paths.boardRoot, config.review.skill)
  const prompt = reviewPrompt({
    skill: config.review.skill,
    prompt: await loadReviewPromptText(paths.boardRoot, config.review.prompt),
  })
  const launched = await launchInProgress({
    bin: config.herdr_bin,
    task: { ...task, project, filePath: task.filePath },
    agent,
    agentKey,
    skillPath: paths.skillPath,
    prompt,
    behavior: config.herdr_behavior,
    runner: opts.runner,
    boardRoot: paths.boardRoot,
  })
  task.project = project
  task.herdr = launched.herdr
  task.status = "review"
  const saved = await saveTask(task)
  return { task: saved, warning: launched.warning }
}

export function laneLabel(lane: Lane): string {
  switch (lane) {
    case "backlog":
      return "Backlog"
    case "in_progress":
      return "In Progress"
    case "review":
      return "Review"
    case "done":
      return "Done"
  }
}
