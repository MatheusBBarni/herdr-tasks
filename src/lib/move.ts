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
import { EMPTY_HERDR, isLaunchLane, type Lane, type Task } from "./types.ts"

export type MoveResult = {
  task: Task
  warning?: string
  pendingLaunch?: "in_progress" | "review"
}

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

  const reusePane = Boolean(next.herdr.pane_id) && (lane !== "review" || previous.status === "review")
  if (reusePane && next.herdr.pane_id) {
    const alive = await herdrPaneAlive(config.herdr_bin, next.herdr.pane_id, runner)
    if (alive) return { task: next }
    next.herdr = { ...EMPTY_HERDR }
    next.updated = new Date().toISOString()
    await writeTask(next)
  }

  if (opts.launch === false) return { task: next, pendingLaunch: lane }

  try {
    return await completeLaunch(lane, paths, next, { runner, config })
  } catch (err) {
    await writeTask(previous)
    if (err instanceof HerdrError) fail(err.message)
    if (err instanceof Error && err.name === "CliError") throw err
    fail(err instanceof Error ? err.message : String(err))
  }
}

type LaunchOpts = { runner?: HerdrRunner; config?: Awaited<ReturnType<typeof loadConfig>> }

async function completeLaunch(
  lane: "in_progress" | "review",
  paths: BoardPaths,
  task: Task,
  opts: LaunchOpts = {},
): Promise<MoveResult> {
  const config = opts.config ?? (await loadConfig(paths))
  const agentKey = lane === "review" ? reviewAgentKey(config, task.agent) : task.agent
  const agent = requireAgent(config, agentKey)
  const project = await resolveProjectPath(paths.boardRoot, task.project)
  let prompt: string | undefined
  if (lane === "review") {
    await resolveReviewSkillPath(paths.boardRoot, config.review.skill)
    prompt = reviewPrompt({
      skill: config.review.skill,
      prompt: await loadReviewPromptText(paths.boardRoot, config.review.prompt),
    })
  }
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
  task.status = lane
  const saved = await saveTask(task)
  return { task: saved, warning: launched.warning }
}

export function completeInProgressLaunch(
  paths: BoardPaths,
  task: Task,
  opts: LaunchOpts = {},
): Promise<MoveResult> {
  return completeLaunch("in_progress", paths, task, opts)
}

export function completeReviewLaunch(
  paths: BoardPaths,
  task: Task,
  opts: LaunchOpts = {},
): Promise<MoveResult> {
  return completeLaunch("review", paths, task, opts)
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
