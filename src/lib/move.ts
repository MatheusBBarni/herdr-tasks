import { requireAgent } from "./agents.ts"
import { loadConfig, loadReviewPromptOrDefault, loadReviewSkillText, reviewAgentKey } from "./config.ts"
import { fail } from "./errors.ts"
import {
  defaultRunner,
  ensureHerdrServer,
  HerdrError,
  herdrPaneAlive,
  launchInProgress,
  promptAgentInPane,
  resolveHerdrBin,
  reviewPrompt,
  type HerdrRunner,
} from "./herdr.ts"
import { buildCustomLanePrompt, isLaunchLane, loadLanePromptText, resolvedLaneDef } from "./lanes.ts"
import { resolveProjectPath, type BoardPaths } from "./root.ts"
import { formatBlockedError } from "./blockers.ts"
import { nextOrder } from "./order.ts"
import { getTask, listTasks, requireLane, saveTask, writeTask } from "./store.ts"
import { EMPTY_HERDR, type Lane, type LaneDef, type Task } from "./types.ts"

export type MoveResult = {
  task: Task
  warning?: string
  pendingLaunch?: string
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
  const config = await loadConfig(paths)
  const lane = requireLane(laneRaw, config.lanes)
  const previous = await getTask(paths, id)
  const runner = opts.runner ?? defaultRunner
  const bin = resolveHerdrBin(config.herdr_bin)
  const launch = isLaunchLane(lane, config.lane_defs)

  if (previous.status === lane && !launch) {
    return { task: previous }
  }

  const next: Task = {
    ...previous,
    status: lane,
    updated: new Date().toISOString(),
  }
  if (previous.status !== lane) {
    const tasks = await listTasks(paths)
    if (lane === "in_progress") {
      const blocked = formatBlockedError(previous.id, tasks, previous.blockers)
      if (blocked) fail(blocked)
    }
    next.order = nextOrder(tasks, lane, id)
  }
  await writeTask(next)

  if (!launch) return { task: next }

  if (next.herdr.pane_id) {
    const alive = await herdrPaneAlive(bin, next.herdr.pane_id, runner)
    const skipLaunch = alive && (lane === "in_progress" || previous.status === lane)
    if (skipLaunch) return { task: next }
    if (!alive) {
      next.herdr = { ...EMPTY_HERDR }
      next.updated = new Date().toISOString()
      await writeTask(next)
    }
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

async function buildReviewPrompt(
  paths: BoardPaths,
  config: Awaited<ReturnType<typeof loadConfig>>,
  taskId: string,
): Promise<string> {
  const text = reviewPrompt({
    skill: await loadReviewSkillText(paths.boardRoot, config.review.skill),
    prompt: await loadReviewPromptOrDefault(paths, config.review.prompt),
  }).replaceAll("<id>", taskId)
  if (!text) {
    fail("Review prompt is empty. Set [review] prompt or add .herdr-tasks/prompts/review.md.")
  }
  return text
}

async function completeLaunch(
  lane: string,
  paths: BoardPaths,
  task: Task,
  opts: LaunchOpts = {},
): Promise<MoveResult> {
  const config = opts.config ?? (await loadConfig(paths))
  const runner = opts.runner ?? defaultRunner
  const bin = resolveHerdrBin(config.herdr_bin)
  const agentKey = lane === "review" ? reviewAgentKey(config, task.agent) : task.agent
  const agent = requireAgent(config, agentKey)
  const project = await resolveProjectPath(paths.boardRoot, task.project)
  const def = resolvedLaneDef(config, lane)
  let prompt: string | undefined
  if (lane === "review") {
    prompt = await buildReviewPrompt(paths, config, task.id)
  } else if (lane !== "in_progress") {
    const text = await loadLanePromptText(paths, def.prompt)
    if (!text) fail(`Lane prompt is empty for '${lane}'. Set [lane.${lane}] prompt.`)
    prompt = buildCustomLanePrompt(text, task.id, def.next_step)
  }

  if (lane !== "in_progress" && task.herdr.pane_id && prompt) {
    const paneId = task.herdr.pane_id
    if (await herdrPaneAlive(bin, paneId, runner)) {
      await ensureHerdrServer(bin, runner)
      const sent = await promptAgentInPane({
        bin,
        paneId,
        prompt,
        runner,
        notReadyWarning: `Herdr has not detected an agent in ${paneId} yet. Prompt not sent.`,
      })
      task.project = project
      task.status = lane
      const saved = await saveTask(task)
      return { task: saved, warning: sent.warning }
    }
  }

  const launched = await launchInProgress({
    bin,
    task: { ...task, project, filePath: task.filePath },
    agent,
    agentKey,
    skillPath: paths.skillPath,
    prompt,
    nextStep: def.next_step || "review",
    behavior: config.herdr_behavior,
    runner,
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

export function completeLaneLaunch(
  lane: string,
  paths: BoardPaths,
  task: Task,
  opts: LaunchOpts = {},
): Promise<MoveResult> {
  return completeLaunch(lane, paths, task, opts)
}

export function laneLabel(lane: Lane, defs: Record<string, LaneDef> = {}): string {
  return resolvedLaneDef({ lane_defs: defs }, lane).name
}
