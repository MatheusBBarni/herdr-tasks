import type { AgentEntry, HerdrBehavior, Task } from "./types.ts"

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
  const root = asRecord(payload) ?? {}
  const result = asRecord(root.result) ?? root
  const workspaceRec = asRecord(result.workspace)
  const tabRec = asRecord(result.tab)
  const rootPane = asRecord(result.root_pane) ?? asRecord(root.root_pane)
  const paneRec = asRecord(result.pane)
  const pane_id = pickString(
    rootPane?.pane_id,
    paneRec?.pane_id,
    result.pane_id,
    root.pane_id,
  )
  let workspace_id = pickString(
    workspaceRec?.workspace_id,
    typeof result.workspace === "string" ? result.workspace : undefined,
    result.workspace_id,
    root.workspace_id,
    tabRec?.workspace_id,
    asRecord(tabRec?.workspace)?.workspace_id,
  )
  if (!workspace_id && pane_id?.includes(":")) {
    workspace_id = pane_id.slice(0, pane_id.indexOf(":"))
  }
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
): Promise<void> {
  await herdrAvailable(bin, runner)
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

export function firstPrompt(task: Task, skillPath: string, behavior: HerdrBehavior = "workspace"): string {
  const place = layoutNoun(behavior)
  return [
    `You are working task ${task.id} in repo ${task.project}.`,
    `Read ${task.filePath}.`,
    `Follow ${skillPath}.`,
    `When complete: \`htasks move ${task.id} done\`.`,
    "`herdr` is the multiplexer already running this " + place + ". `htasks` is the task board CLI.",
  ].join("\n")
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

export async function launchInProgress(opts: {
  bin: string
  task: Task
  agent: AgentEntry
  agentKey: string
  skillPath: string
  behavior?: HerdrBehavior
  runner?: HerdrRunner
  env?: NodeJS.Dict<string | undefined>
  detectTimeoutMs?: number
}): Promise<LaunchResult> {
  const runner = opts.runner ?? defaultRunner
  const env = opts.env ?? process.env
  const behavior = opts.behavior ?? "workspace"
  const { bin, task, agent } = opts
  try {
    await ensureHerdrServer(bin, runner)
  } catch (err) {
    if (err instanceof HerdrError) throw err
    throw new HerdrError(err instanceof Error ? err.message : String(err))
  }

  const createArgs = herdrCreateArgs(behavior, task, env)
  let created: WorkspaceCreateResult
  try {
    created = parseCreatedLayout(await runJson(runner, bin, createArgs), behavior)
  } catch (err) {
    if (err instanceof HerdrError && /not running|server/i.test(err.message + err.stderr)) {
      await ensureHerdrServer(bin, runner)
      created = parseCreatedLayout(await runJson(runner, bin, createArgs), behavior)
    } else {
      throw err
    }
  }

  const herdr: Task["herdr"] = {
    workspace_id: created.workspace_id,
    pane_id: created.pane_id,
    agent_name: null,
  }

  const run = await runner(bin, ["pane", "run", created.pane_id, agent.command])
  if (run.code !== 0) {
    return {
      herdr,
      warning: run.stderr.trim() || run.stdout.trim() || "herdr pane run failed",
    }
  }

  const detectMs = opts.detectTimeoutMs ?? 30_000
  const ready = await waitForAgentOnPane(
    runner,
    bin,
    created.pane_id,
    detectMs,
  )
  if (!ready) {
    return {
      herdr,
      warning: `Started ${agent.command} in ${created.pane_id}, but Herdr has not detected an agent yet. First prompt not sent.`,
    }
  }

  await runner(bin, ["agent", "wait", created.pane_id, "--until", "idle", "--timeout", String(detectMs)])

  const promptText = firstPrompt(task, opts.skillPath, behavior)
  const prompt = await runner(bin, ["agent", "prompt", created.pane_id, promptText])
  if (prompt.code !== 0) {
    const typed = await runner(bin, ["agent", "send-keys", created.pane_id, "enter"])
    if (typed.code !== 0) {
      const detail = prompt.stderr.trim() || prompt.stdout.trim() || "herdr agent prompt failed"
      return { herdr, warning: detail }
    }
  }

  const working = await runner(bin, [
    "agent",
    "wait",
    created.pane_id,
    "--until",
    "working",
    "--timeout",
    "5000",
  ])
  if (working.code !== 0) {
    await runner(bin, ["agent", "send-keys", created.pane_id, "enter"])
  }

  return { herdr }
}
