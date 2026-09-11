import { resolveKind } from "./agents.ts"
import { commandWithEffort } from "./effort.ts"
import { isLaunchLane } from "./lanes.ts"
import type { AgentEntry, HerdrBehavior, LaneDef, Task } from "./types.ts"
import { linkBoardIntoWorktree, worktreeBranch } from "./worktree.ts"

export type HerdrRunResult = {
  code: number
  stdout: string
  stderr: string
}

export type HerdrRunner = (bin: string, args: string[]) => Promise<HerdrRunResult>

export type WorkspaceCreateResult = {
  workspace_id: string
  pane_id: string
}

export type LaunchResult = {
  herdr: Task["herdr"]
  warning?: string
}

export class HerdrError extends Error {
  readonly stderr: string
  readonly stdout: string
  readonly code: number

  constructor(message: string, opts: { stderr?: string; stdout?: string; code?: number } = {}) {
    super(message)
    this.name = "HerdrError"
    this.stderr = opts.stderr ?? ""
    this.stdout = opts.stdout ?? ""
    this.code = opts.code ?? 1
  }
}

export async function defaultRunner(bin: string, args: string[]): Promise<HerdrRunResult> {
  if (args.length === 1 && args[0] === "server") {
    Bun.spawn([bin, "server"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    })
    return { code: 0, stdout: "", stderr: "" }
  }
  const proc = Bun.spawn([bin, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

function parseJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new HerdrError(`herdr returned non-JSON output: ${trimmed.slice(0, 400)}`, {
      stdout: text,
    })
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value
  }
  return undefined
}

function agentRecords(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload) ?? {}
  const result = asRecord(root.result) ?? root
  const lists = [result.agents, result.list, root.agents]
  const out: Record<string, unknown>[] = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const rec = asRecord(item)
      if (rec) out.push(rec)
    }
  }
  return out
}

export function herdrCreateArgs(
  behavior: HerdrBehavior,
  task: { id: string; project: string },
  env: NodeJS.Dict<string | undefined> = process.env,
): string[] {
  if (behavior === "tab") {
    const args = ["tab", "create", "--cwd", task.project, "--label", task.id, "--no-focus"]
    if (env.HERDR_WORKSPACE_ID) args.push("--workspace", env.HERDR_WORKSPACE_ID)
    return args
  }
  if (behavior === "pane") {
    const args = ["pane", "split", "--cwd", task.project, "--no-focus"]
    if (env.HERDR_PANE_ID) args.push("--pane", env.HERDR_PANE_ID)
    else if (env.HERDR_ENV === "1") args.push("--current")
    return args
  }
  return ["workspace", "create", "--cwd", task.project, "--label", task.id, "--no-focus"]
}

export async function herdrPaneAlive(
  bin: string,
  paneId: string,
  runner: HerdrRunner = defaultRunner,
): Promise<boolean> {
  const result = await runner(bin, ["pane", "get", paneId])
  return result.code === 0
}

export function parseCreatedLayout(
  payload: unknown,
  kind: HerdrBehavior = "workspace",
): WorkspaceCreateResult {
  const { pane_id, workspace_id } = layoutFields(payload)
  if (!workspace_id || !pane_id) {
    throw new HerdrError(
      `herdr ${kind} did not return workspace_id and pane_id. Got: ${JSON.stringify(payload).slice(0, 500)}`,
    )
  }
  return { workspace_id, pane_id }
}

export function parseWorkspaceCreate(payload: unknown): WorkspaceCreateResult {
  return parseCreatedLayout(payload, "workspace")
}

export type PaneInfo = {
  pane_id: string
  workspace_id: string
  tab_id: string
}

export function parsePaneInfo(payload: unknown): PaneInfo {
  const { root, result, pane_id, workspace_id } = layoutFields(payload)
  const pane = asRecord(result.pane) ?? result
  const tab_id = pickString(pane.tab_id, result.tab_id, root.tab_id)
  if (!pane_id || !tab_id || !workspace_id) {
    throw new HerdrError(
      `herdr pane get did not return pane_id, tab_id, and workspace_id. Got: ${JSON.stringify(payload).slice(0, 500)}`,
    )
  }
  return { pane_id, workspace_id, tab_id }
}

export function herdrFocusArgs(
  behavior: HerdrBehavior,
  ids: { workspace_id?: string | null; pane_id?: string | null; tab_id?: string | null },
): string[] {
  if (behavior === "workspace") {
    const id = ids.workspace_id?.trim()
    if (!id) throw new HerdrError("No workspace_id to focus.")
    return ["workspace", "focus", id]
  }
  if (behavior === "tab") {
    const id = ids.tab_id?.trim()
    if (!id) throw new HerdrError("No tab_id to focus.")
    return ["tab", "focus", id]
  }
  const id = ids.pane_id?.trim()
  if (!id) throw new HerdrError("No pane_id to focus.")
  // herdr pane focus is neighbor-only (--direction). Agent commands accept a pane id.
  return ["agent", "focus", id]
}

export function herdrCloseArgs(
  behavior: HerdrBehavior,
  ids: { workspace_id?: string | null; pane_id?: string | null; tab_id?: string | null },
): string[] {
  if (behavior === "workspace") {
    const id = ids.workspace_id?.trim()
    if (!id) throw new HerdrError("No workspace_id to close.")
    return ["workspace", "close", id]
  }
  if (behavior === "tab") {
    const id = ids.tab_id?.trim()
    if (!id) throw new HerdrError("No tab_id to close.")
    return ["tab", "close", id]
  }
  const id = ids.pane_id?.trim()
  if (!id) throw new HerdrError("No pane_id to close.")
  return ["pane", "close", id]
}

export function parseAgentNames(payload: unknown): string[] {
  const names: string[] = []
  for (const rec of agentRecords(payload)) {
    const name = pickString(rec.name, rec.agent_name, rec.id, rec.agent)
    if (name) names.push(name)
  }
  return names
}

export function agentOnPane(payload: unknown, paneId: string): boolean {
  return agentRecords(payload).some((rec) => rec.pane_id === paneId)
}

export const HERDR_AGENT_STATUSES = ["idle", "working", "blocked", "done", "unknown"] as const
export type HerdrAgentStatus = (typeof HERDR_AGENT_STATUSES)[number]
export type LiveAgentStatus = HerdrAgentStatus | "gone"

export function isHerdrAgentStatus(value: string): value is HerdrAgentStatus {
  return (HERDR_AGENT_STATUSES as readonly string[]).includes(value)
}

/** Index `herdr agent list` JSON by pane_id. Unknown / missing statuses become `unknown`. */
export function parseAgentStatus(payload: unknown): Map<string, HerdrAgentStatus> {
  const map = new Map<string, HerdrAgentStatus>()
  for (const rec of agentRecords(payload)) {
    const paneId = pickString(rec.pane_id)
    if (!paneId) continue
    const raw = pickString(rec.agent_status)
    map.set(paneId, raw && isHerdrAgentStatus(raw) ? raw : "unknown")
  }
  return map
}

export function joinPaneStatuses(
  paneIds: readonly string[],
  listed: ReadonlyMap<string, HerdrAgentStatus> | null,
): Map<string, LiveAgentStatus> {
  const out = new Map<string, LiveAgentStatus>()
  for (const paneId of paneIds) {
    if (!paneId || out.has(paneId)) continue
    if (!listed) {
      out.set(paneId, "gone")
      continue
    }
    out.set(paneId, listed.get(paneId) ?? "gone")
  }
  return out
}

export async function listAgentStatuses(
  bin: string,
  runner: HerdrRunner = defaultRunner,
): Promise<Map<string, HerdrAgentStatus>> {
  const payload = await runJson(runner, bin, ["agent", "list"])
  return parseAgentStatus(payload)
}

export function isServerRunning(payload: unknown): boolean {
  const root = asRecord(payload) ?? {}
  const server = asRecord(root.server)
  if (server?.running === true) return true
  if (server?.status === "running") return true
  return false
}

async function runJson(runner: HerdrRunner, bin: string, args: string[]): Promise<unknown> {
  const result = await runner(bin, args)
  if (result.code !== 0) {
    const errText = result.stderr.trim() || result.stdout.trim()
    throw new HerdrError(errText || `herdr ${args.join(" ")} failed with exit ${result.code}`, {
      stderr: result.stderr,
      stdout: result.stdout,
      code: result.code,
    })
  }
  if (!result.stdout.trim()) return null
  return parseJson(result.stdout)
}

export function runningInsideHerdr(env: NodeJS.Dict<string | undefined> = process.env): boolean {
  return env.HERDR_ENV === "1"
}

export function resolveHerdrBin(
  configBin?: string | null,
  env: NodeJS.Dict<string | undefined> = process.env,
): string {
  const fromEnv = env.HERDR_BIN_PATH?.trim()
  if (fromEnv) return fromEnv
  const fromConfig = configBin?.trim()
  if (fromConfig) return fromConfig
  return "herdr"
}

export async function herdrAvailable(bin: string, runner: HerdrRunner = defaultRunner): Promise<void> {
  try {
    await runner(bin, ["--version"])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("ENOENT") || message.includes("not found")) {
      throw new HerdrError(
        `herdr not found (${bin}). Install herdr separately and ensure it is on PATH. https://herdr.dev`,
      )
    }
    throw err
  }
}

export async function ensureHerdrServer(
  bin: string,
  runner: HerdrRunner = defaultRunner,
  env: NodeJS.Dict<string | undefined> = process.env,
): Promise<void> {
  await herdrAvailable(bin, runner)
  if (runningInsideHerdr(env)) return
  const status = await runner(bin, ["status", "--json"])
  if (status.code === 0) {
    try {
      if (isServerRunning(parseJson(status.stdout))) return
    } catch {
      // fall through to start
    }
  }
  const start = await runner(bin, ["server"])
  for (let i = 0; i < 20; i++) {
    await Bun.sleep(150)
    const retry = await runner(bin, ["status", "--json"])
    if (retry.code === 0) {
      try {
        if (isServerRunning(parseJson(retry.stdout))) return
      } catch {
        // keep polling
      }
    }
    if (i === 19) {
      const detail = (start.stderr || start.stdout || retry.stderr || retry.stdout).trim()
      throw new HerdrError(
        `Herdr server is not running and could not be started.${detail ? `\n${detail}` : ""}\nStart herdr once in a terminal, then retry.`,
        { stderr: start.stderr || retry.stderr, stdout: start.stdout || retry.stdout, code: start.code || retry.code },
      )
    }
  }
}

export function layoutNoun(behavior: HerdrBehavior): string {
  if (behavior === "tab") return "tab"
  if (behavior === "workspace") return "workspace"
  return "pane"
}

export function hasHerdrLayout(task: Task): boolean {
  return Boolean(task.herdr.pane_id?.trim() || task.herdr.workspace_id?.trim())
}

function workspaceIdFromPane(paneId: string | null | undefined): string | undefined {
  if (!paneId?.includes(":")) return undefined
  return paneId.slice(0, paneId.indexOf(":"))
}

function layoutFields(payload: unknown): {
  root: Record<string, unknown>
  result: Record<string, unknown>
  pane_id?: string
  workspace_id?: string
} {
  const root = asRecord(payload) ?? {}
  const result = asRecord(root.result) ?? root
  const workspaceRec = asRecord(result.workspace)
  const tabRec = asRecord(result.tab)
  const rootPane = asRecord(result.root_pane) ?? asRecord(root.root_pane)
  const paneRec = asRecord(result.pane)
  const pane_id = pickString(rootPane?.pane_id, paneRec?.pane_id, result.pane_id, root.pane_id)
  const workspace_id = pickString(
    workspaceRec?.workspace_id,
    typeof result.workspace === "string" ? result.workspace : undefined,
    result.workspace_id,
    root.workspace_id,
    tabRec?.workspace_id,
    asRecord(tabRec?.workspace)?.workspace_id,
    paneRec?.workspace_id,
    asRecord(paneRec?.workspace)?.workspace_id,
    workspaceIdFromPane(pane_id),
  )
  return { root, result, pane_id, workspace_id }
}

function isLayoutGone(err: unknown): boolean {
  if (!(err instanceof HerdrError)) return false
  const text = `${err.message}
${err.stderr}
${err.stdout}`
  return /not found|unknown|does not exist|no such|already closed/i.test(text)
}

function isCallerLayout(
  behavior: HerdrBehavior,
  ids: { workspace_id?: string | null; pane_id?: string | null; tab_id?: string | null },
  env: NodeJS.Dict<string | undefined>,
): boolean {
  if (behavior === "workspace") {
    return Boolean(ids.workspace_id && env.HERDR_WORKSPACE_ID === ids.workspace_id)
  }
  if (behavior === "tab") {
    return Boolean(ids.tab_id && env.HERDR_TAB_ID === ids.tab_id)
  }
  return Boolean(ids.pane_id && env.HERDR_PANE_ID === ids.pane_id)
}

function storedLayoutIds(task: Task): { pane_id: string | null; workspace_id: string | null } {
  const pane_id = task.herdr.pane_id
  return {
    pane_id,
    workspace_id: task.herdr.workspace_id ?? workspaceIdFromPane(pane_id) ?? null,
  }
}

async function resolveTaskLayoutIds(opts: {
  bin: string
  task: Task
  behavior: HerdrBehavior
  runner: HerdrRunner
  missingMessage: string
}): Promise<{ workspace_id: string | null; pane_id: string | null; tab_id: string | null }> {
  const stored = storedLayoutIds(opts.task)
  if (!stored.pane_id && !stored.workspace_id) {
    throw new HerdrError(opts.missingMessage)
  }
  let tabId: string | null = null
  let workspaceId = stored.workspace_id
  if (opts.behavior === "tab") {
    if (!stored.pane_id) throw new HerdrError(`${opts.task.id} has no pane_id.`)
    const info = parsePaneInfo(await runJson(opts.runner, opts.bin, ["pane", "get", stored.pane_id]))
    tabId = info.tab_id
    workspaceId = workspaceId ?? info.workspace_id
  }
  return { workspace_id: workspaceId, pane_id: stored.pane_id, tab_id: tabId }
}

export async function focusTaskLayout(opts: {
  bin: string
  task: Task
  behavior?: HerdrBehavior
  runner?: HerdrRunner
  laneDefs?: Record<string, LaneDef>
}): Promise<{ noun: string; id: string }> {
  const runner = opts.runner ?? defaultRunner
  const behavior = opts.behavior ?? "workspace"
  const { bin, task } = opts
  const noun = layoutNoun(behavior)

  if (!isLaunchLane(task.status, opts.laneDefs)) {
    throw new HerdrError(`${task.id} is not in a launch lane.`)
  }

  const missing = `${task.id} has no Herdr ${noun} yet.`
  const stored = storedLayoutIds(task)
  if (!stored.pane_id && !stored.workspace_id) throw new HerdrError(missing)

  await herdrAvailable(bin, runner)
  const ids = await resolveTaskLayoutIds({
    bin,
    task,
    behavior,
    runner,
    missingMessage: missing,
  })

  const args = herdrFocusArgs(behavior, ids)
  await runJson(runner, bin, args)
  const id = args[2]
  if (!id) throw new HerdrError(`herdr ${noun} focus did not receive a target id.`)
  return { noun, id }
}

export async function closeTaskLayout(opts: {
  bin: string
  task: Task
  behavior?: HerdrBehavior
  runner?: HerdrRunner
  env?: NodeJS.Dict<string | undefined>
}): Promise<{ noun: string; id: string; alreadyGone?: boolean }> {
  const runner = opts.runner ?? defaultRunner
  const behavior = opts.behavior ?? "workspace"
  const env = opts.env ?? process.env
  const { bin, task } = opts
  const noun = layoutNoun(behavior)

  if (task.status !== "done") {
    throw new HerdrError(`${task.id} is not done.`)
  }

  const missing = `${task.id} has no Herdr ${noun} to close.`
  const stored = storedLayoutIds(task)
  const fallbackId = stored.pane_id ?? stored.workspace_id
  if (!fallbackId) throw new HerdrError(missing)

  await herdrAvailable(bin, runner)
  let ids: { workspace_id: string | null; pane_id: string | null; tab_id: string | null }
  try {
    ids = await resolveTaskLayoutIds({
      bin,
      task,
      behavior,
      runner,
      missingMessage: missing,
    })
  } catch (err) {
    if (isLayoutGone(err)) return { noun, id: fallbackId, alreadyGone: true }
    throw err
  }
  if (isCallerLayout(behavior, ids, env)) {
    throw new HerdrError(`Refusing to close the current ${noun}.`)
  }

  const args = herdrCloseArgs(behavior, ids)
  const id = args[2]
  if (!id) throw new HerdrError(`herdr ${noun} close did not receive a target id.`)
  try {
    await runJson(runner, bin, args)
  } catch (err) {
    if (isLayoutGone(err)) return { noun, id, alreadyGone: true }
    throw err
  }
  return { noun, id }
}

export type WorktreeInfo = {
  branch: string
  path: string
  open_workspace_id?: string
}

export type WorktreeCreateResult = {
  path: string
  workspace_id?: string
  pane_id?: string
}

export type WorktreeEnsureResult = WorktreeCreateResult & {
  created: boolean
}

export function worktreeCreateArgs(task: { id: string; type: string; project: string }): string[] {
  // herdr treats --workspace and --cwd as mutually exclusive. Always pass the
  // task project as --cwd; never inherit HERDR_WORKSPACE_ID from the board pane.
  return [
    "worktree",
    "create",
    "--cwd",
    task.project,
    "--branch",
    worktreeBranch(task.type, task.id),
    "--label",
    task.id,
    "--no-focus",
  ]
}

export function parseWorktreeList(payload: unknown): WorktreeInfo[] {
  const root = asRecord(payload) ?? {}
  const result = asRecord(root.result) ?? root
  const list = result.worktrees
  if (!Array.isArray(list)) return []
  const out: WorktreeInfo[] = []
  for (const item of list) {
    const rec = asRecord(item)
    if (!rec) continue
    const branch = pickString(rec.branch)
    const path = pickString(rec.path)
    if (!branch || !path) continue
    out.push({
      branch,
      path,
      open_workspace_id: pickString(rec.open_workspace_id),
    })
  }
  return out
}

export function parseWorktreeCreate(payload: unknown): WorktreeCreateResult {
  const { root, result, pane_id, workspace_id } = layoutFields(payload)
  const worktree = asRecord(result.worktree) ?? asRecord(root.worktree)
  const path = pickString(worktree?.path, result.path, root.path)
  if (!path) {
    throw new HerdrError(
      `herdr worktree create did not return a path. Got: ${JSON.stringify(payload).slice(0, 500)}`,
    )
  }
  return { path, workspace_id, pane_id }
}

export async function ensureTaskWorktree(opts: {
  bin: string
  task: Pick<Task, "id" | "type" | "project">
  runner?: HerdrRunner
}): Promise<WorktreeEnsureResult> {
  const runner = opts.runner ?? defaultRunner
  const { bin, task } = opts
  const branch = worktreeBranch(task.type, task.id)
  const listed = parseWorktreeList(await runJson(runner, bin, ["worktree", "list", "--cwd", task.project]))
  const existing = listed.find((item) => item.branch === branch)
  if (existing) return { path: existing.path, created: false }

  const created = parseWorktreeCreate(await runJson(runner, bin, worktreeCreateArgs(task)))
  return { ...created, created: true }
}

export function firstPrompt(
  task: Task,
  skillPath: string,
  behavior: HerdrBehavior = "workspace",
  nextStep = "review",
): string {
  const place = layoutNoun(behavior)
  const next = nextStep.trim() || "review"
  const spec = task.body.trim()
  const footer = [
    `Task ${task.id} in ${task.project}.`,
    `Read ${task.filePath}.`,
    `Follow ${skillPath}.`,
    "The task body is the spec. Implement it fully. Do not add unrelated work.",
    `When complete, run \`htasks move ${task.id} ${next}\` yourself. That move sends the next prompt. Do not wait for a human.`,
    "`herdr` is the multiplexer already running this " + place + ". `htasks` is the task board CLI.",
  ]
  if (!spec) return footer.join("\n")
  return `${spec}\n\n${footer.join("\n")}`
}

export function reviewPrompt(opts: { skill?: string; prompt?: string } = {}): string {
  const skill = opts.skill?.trim() ?? ""
  const prompt = opts.prompt?.trim() ?? ""
  return [skill, prompt].filter(Boolean).join("\n\n")
}

async function waitForAgentOnPane(
  runner: HerdrRunner,
  bin: string,
  paneId: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, timeoutMs)
  while (true) {
    try {
      const payload = await runJson(runner, bin, ["agent", "list"])
      if (agentOnPane(payload, paneId)) return true
    } catch {
      // keep polling
    }
    if (Date.now() >= deadline) return false
    await Bun.sleep(200)
  }
}

export async function promptAgentInPane(opts: {
  bin: string
  paneId: string
  prompt: string
  runner?: HerdrRunner
  detectTimeoutMs?: number
  notReadyWarning: string
}): Promise<{ warning?: string }> {
  const runner = opts.runner ?? defaultRunner
  const detectMs = opts.detectTimeoutMs ?? 30_000
  const ready = await waitForAgentOnPane(runner, opts.bin, opts.paneId, detectMs)
  if (!ready) return { warning: opts.notReadyWarning }

  await runner(opts.bin, ["agent", "wait", opts.paneId, "--until", "idle", "--timeout", String(detectMs)])

  const prompt = await runner(opts.bin, ["agent", "prompt", opts.paneId, opts.prompt])
  if (prompt.code !== 0) {
    const typed = await runner(opts.bin, ["agent", "send-keys", opts.paneId, "enter"])
    if (typed.code !== 0) {
      const detail = prompt.stderr.trim() || prompt.stdout.trim() || "herdr agent prompt failed"
      return { warning: detail }
    }
  }

  const working = await runner(opts.bin, [
    "agent",
    "wait",
    opts.paneId,
    "--until",
    "working",
    "--timeout",
    "5000",
  ])
  if (working.code !== 0) {
    await runner(opts.bin, ["agent", "send-keys", opts.paneId, "enter"])
  }
  return {}
}

export async function launchInProgress(opts: {
  bin: string
  task: Task
  agent: AgentEntry
  agentKey: string
  skillPath: string
  prompt?: string
  nextStep?: string
  behavior?: HerdrBehavior
  runner?: HerdrRunner
  env?: NodeJS.Dict<string | undefined>
  detectTimeoutMs?: number
  boardRoot?: string
}): Promise<LaunchResult> {
  const runner = opts.runner ?? defaultRunner
  const env = opts.env ?? process.env
  const behavior = opts.behavior ?? "workspace"
  const { bin, task, agent } = opts
  try {
    await ensureHerdrServer(bin, runner, env)
  } catch (err) {
    if (err instanceof HerdrError) throw err
    throw new HerdrError(err instanceof Error ? err.message : String(err))
  }

  let layoutTask = { id: task.id, project: task.project }
  let created: WorkspaceCreateResult | undefined
  if (task.worktree) {
    const worktree = await ensureTaskWorktree({ bin, task, runner })
    layoutTask = { id: task.id, project: worktree.path }
    if (opts.boardRoot) {
      await linkBoardIntoWorktree(worktree.path, opts.boardRoot)
    }
    const extraId = worktree.workspace_id
    const callerWs = env.HERDR_WORKSPACE_ID
    if (extraId && extraId !== callerWs) {
      if (behavior === "workspace" && worktree.pane_id) {
        created = { workspace_id: extraId, pane_id: worktree.pane_id }
      } else {
        try {
          await runJson(runner, bin, ["workspace", "close", extraId])
        } catch {
          // keep the checkout even if the extra workspace cannot be closed
        }
      }
    }
  }

  const createArgs = herdrCreateArgs(behavior, layoutTask, env)
  if (!created) {
    try {
      created = parseCreatedLayout(await runJson(runner, bin, createArgs), behavior)
    } catch (err) {
      if (err instanceof HerdrError && /not running|server/i.test(err.message + err.stderr)) {
        await ensureHerdrServer(bin, runner, env)
        created = parseCreatedLayout(await runJson(runner, bin, createArgs), behavior)
      } else {
        throw err
      }
    }
  }

  const herdr: Task["herdr"] = {
    workspace_id: created.workspace_id,
    pane_id: created.pane_id,
    agent_name: null,
  }

  const runCommand = commandWithEffort(
    agent.command,
    resolveKind(opts.agentKey, agent),
    task.effort ?? "",
  )
  const run = await runner(bin, ["pane", "run", created.pane_id, runCommand])
  if (run.code !== 0) {
    return {
      herdr,
      warning: run.stderr.trim() || run.stdout.trim() || "herdr pane run failed",
    }
  }

  const prompted = await promptAgentInPane({
    bin,
    paneId: created.pane_id,
    prompt: opts.prompt ?? firstPrompt({ ...task, project: layoutTask.project }, opts.skillPath, behavior, opts.nextStep),
    runner,
    detectTimeoutMs: opts.detectTimeoutMs,
    notReadyWarning: `Started ${runCommand} in ${created.pane_id}, but Herdr has not detected an agent yet. First prompt not sent.`,
  })
  return { herdr, warning: prompted.warning }
}
