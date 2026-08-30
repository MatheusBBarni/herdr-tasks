import { readdir, cp } from "node:fs/promises"
import { join, resolve } from "node:path"
import { requireAgent } from "./agents.ts"
import { defaultProjectPath, resolveProjectInput } from "./projects.ts"
import { loadConfig, saveConfig, taskFilePath, writeInitConfig } from "./config.ts"
import { fail } from "./errors.ts"
import { ensureDir, isDirectory, pathExists, readText, writeFileAtomic } from "./fs.ts"
import { formatTaskId } from "./ids.ts"
import { packagedReviewPromptPath, packagedSkillPath, pathsFor, type BoardPaths } from "./root.ts"
import {
  assertBlockersValid,
  formatBlockedError,
  parseBlockers,
} from "./blockers.ts"
import { normalizeEffort } from "./effort.ts"
import { NONE_TASK_TYPE, normalizeTaskType } from "./task-types.ts"
import { normalizeWorktree, parseWorktreeField } from "./worktree.ts"
import {
  LANES,
  type Config,
  type Lane,
  type Task,
  type TaskInput,
  type TaskPatch,
} from "./types.ts"

export function isLane(value: string): value is Lane {
  return (LANES as readonly string[]).includes(value)
}

export function requireLane(value: string): Lane {
  if (!isLane(value)) {
    fail(`Unknown lane '${value}'. Use ${LANES.join(", ")}.`)
  }
  return value
}

function nowIso(): string {
  return new Date().toISOString()
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return undefined
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return asString(value) ?? null
}

type Frontmatter = {
  id?: unknown
  title?: unknown
  status?: unknown
  type?: unknown
  agent?: unknown
  effort?: unknown
  project?: unknown
  created?: unknown
  updated?: unknown
  herdr?: unknown
  blockers?: unknown
  worktree?: unknown
}

function splitMarkdown(text: string): { yaml: string; body: string } {
  const trimmed = text.replace(/^\uFEFF/, "")
  if (!trimmed.startsWith("---")) {
    return { yaml: "", body: trimmed }
  }
  const rest = trimmed.slice(3).replace(/^\r?\n/, "")
  const end = rest.search(/\r?\n---\r?\n/)
  if (end === -1) {
    const alt = rest.search(/\r?\n---\s*$/)
    if (alt === -1) return { yaml: "", body: trimmed }
    return { yaml: rest.slice(0, alt), body: "" }
  }
  const nl = rest.slice(end).match(/^\r?\n---\r?\n/)?.[0]?.length ?? 5
  return { yaml: rest.slice(0, end), body: rest.slice(end + nl) }
}

function parseHerdr(raw: unknown): Task["herdr"] {
  if (!raw || typeof raw !== "object") {
    return { workspace_id: null, pane_id: null, agent_name: null }
  }
  const rec = raw as Record<string, unknown>
  return {
    workspace_id: asNullableString(rec.workspace_id),
    pane_id: asNullableString(rec.pane_id),
    agent_name: asNullableString(rec.agent_name),
  }
}

export function parseTaskMarkdown(text: string, filePath: string): Task {
  const { yaml, body } = splitMarkdown(text)
  if (!yaml.trim()) fail(`Task file is missing YAML frontmatter: ${filePath}`)
  let fm: Frontmatter
  try {
    fm = Bun.YAML.parse(yaml) as Frontmatter
  } catch (err) {
    fail(`Invalid YAML frontmatter in ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
  }
  const id = asString(fm.id)
  const title = asString(fm.title)
  const statusRaw = asString(fm.status)
  const type = asString(fm.type)?.trim() ?? NONE_TASK_TYPE
  const agent = asString(fm.agent)
  const effort = normalizeEffort(asString(fm.effort))
  const project = asString(fm.project)
  if (!id) fail(`Task is missing id: ${filePath}`)
  if (!title) fail(`Task ${id} is missing title.`)
  if (!statusRaw) fail(`Task ${id} is missing status.`)
  if (!isLane(statusRaw)) fail(`Task ${id} has invalid status '${statusRaw}'.`)
  if (!agent) fail(`Task ${id} is missing agent.`)
  if (!project) fail(`Task ${id} is missing project.`)
  return {
    id,
    title,
    status: statusRaw,
    type,
    agent,
    effort,
    project,
    created: asString(fm.created) ?? nowIso(),
    updated: asString(fm.updated) ?? nowIso(),
    herdr: parseHerdr(fm.herdr),
    blockers: parseBlockers(fm.blockers),
    worktree: parseWorktreeField(fm.worktree),
    body: body.replace(/^\n/, ""),
    filePath,
  }
}

function yamlDump(task: Task): string {
  const doc = {
    id: task.id,
    title: task.title,
    status: task.status,
    ...(task.type ? { type: task.type } : {}),
    agent: task.agent,
    ...(task.effort ? { effort: task.effort } : {}),
    project: task.project,
    ...(task.blockers.length > 0 ? { blockers: task.blockers } : {}),
    ...(task.worktree ? { worktree: true } : {}),
    created: task.created,
    updated: task.updated,
    herdr: {
      workspace_id: task.herdr.workspace_id,
      pane_id: task.herdr.pane_id,
      agent_name: task.herdr.agent_name,
    },
  }
  return Bun.YAML.stringify(doc, null, 2).trimEnd()
}

export function renderTaskMarkdown(task: Task): string {
  const body = task.body.replace(/^\n+/, "").replace(/\n+$/, "")
  return `---\n${yamlDump(task)}\n---\n\n${body}\n`
}

function defaultBody(title: string, description: string): string {
  const desc = description.trim()
  return desc ? `# ${title}\n\n${desc}` : `# ${title}`
}

export async function writeTask(task: Task): Promise<void> {
  await writeFileAtomic(task.filePath, renderTaskMarkdown(task))
}

export async function readTaskFile(filePath: string): Promise<Task> {
  if (!(await pathExists(filePath))) fail(`Unknown task file: ${filePath}`)
  return parseTaskMarkdown(await readText(filePath), filePath)
}

export async function listTasks(paths: BoardPaths): Promise<Task[]> {
  await ensureDir(paths.tasksDir)
  const names = await readdir(paths.tasksDir)
  const tasks: Task[] = []
  for (const name of names.sort()) {
    if (!name.endsWith(".md")) continue
    if (name.startsWith(".")) continue
    const filePath = join(paths.tasksDir, name)
    tasks.push(await readTaskFile(filePath))
  }
  return tasks
}

export async function getTask(paths: BoardPaths, id: string): Promise<Task> {
  const filePath = taskFilePath(paths, id)
  if (!(await pathExists(filePath))) fail(`Unknown task '${id}'. Try \`htasks list\`.`)
  return readTaskFile(filePath)
}

export async function createTask(
  paths: BoardPaths,
  input: TaskInput,
  cwd = process.cwd(),
): Promise<Task> {
  const config = await loadConfig(paths)
  const title = input.title.trim()
  if (!title) fail("Title is required.")
  const status = input.status ?? "backlog"
  requireLane(status)
  const agent = input.agent?.trim() || config.default_agent
  requireAgent(config, agent)
  const type = normalizeTaskType(config, input.type, config.default_type)
  const effort = normalizeEffort(input.effort)
  const project = resolveProjectInput(config, input.project, defaultProjectPath(config, cwd))
  if (!(await isDirectory(resolve(project)))) {
    fail(`Project path does not exist or is not a directory: ${project}`)
  }
  const id = formatTaskId(config.prefix, config.next_id)
  const filePath = taskFilePath(paths, id)
  if (await pathExists(filePath)) fail(`Task file already exists: ${filePath}`)
  const stamp = nowIso()
  const task: Task = {
    id,
    title,
    status,
    type,
    agent,
    effort,
    project,
    created: stamp,
    updated: stamp,
    herdr: { workspace_id: null, pane_id: null, agent_name: null },
    blockers: [],
    worktree: normalizeWorktree(input.worktree),
    body: defaultBody(title, input.description ?? ""),
    filePath,
  }
  const existing = await listTasks(paths)
  task.blockers = assertBlockersValid(existing, input.blockers ?? [], id)
  if (status === "in_progress") {
    const blocked = formatBlockedError(id, existing, task.blockers)
    if (blocked) fail(blocked)
  }
  await ensureDir(paths.tasksDir)
  await writeTask(task)
  config.next_id += 1
  await saveConfig(paths, config)
  return task
}

export async function editTask(paths: BoardPaths, id: string, patch: TaskPatch): Promise<Task> {
  if (
    !patch.title &&
    patch.description === undefined &&
    patch.type === undefined &&
    !patch.agent &&
    patch.effort === undefined &&
    !patch.project &&
    patch.blockers === undefined &&
    patch.worktree === undefined
  ) {
    fail("Nothing to edit. Pass --title, --description, --type, --agent, --effort, --project, --blockers, or --worktree.")
  }
  const config = await loadConfig(paths)
  const task = await getTask(paths, id)
  if (task.status === "done") {
    fail("Cannot edit a done task. Move it out of done first.")
  }
  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (!title) fail("Title is required.")
    const heading = `# ${task.title}`
    if (task.body.startsWith(heading)) {
      task.body = `# ${title}${task.body.slice(heading.length)}`
    }
    task.title = title
  }
  if (patch.description !== undefined) {
    task.body = defaultBody(task.title, patch.description)
  }
  if (patch.type !== undefined) {
    task.type = normalizeTaskType(config, patch.type, NONE_TASK_TYPE)
  }
  if (patch.agent !== undefined) {
    const agent = patch.agent.trim()
    requireAgent(config, agent)
    task.agent = agent
  }
  if (patch.effort !== undefined) {
    task.effort = normalizeEffort(patch.effort)
  }
  if (patch.project !== undefined) {
    const project = resolveProjectInput(config, patch.project, "")
    if (!(await isDirectory(resolve(project)))) {
      fail(`Project path does not exist or is not a directory: ${project}`)
    }
    task.project = project
  }
  if (patch.blockers !== undefined) {
    const existing = await listTasks(paths)
    task.blockers = assertBlockersValid(existing, patch.blockers, id)
  }
  if (patch.worktree !== undefined) {
    task.worktree = normalizeWorktree(patch.worktree)
  }
  task.updated = nowIso()
  await writeTask(task)
  return task
}

export async function updateTaskStatus(
  paths: BoardPaths,
  id: string,
  status: Lane,
  herdr?: Task["herdr"],
): Promise<Task> {
  const task = await getTask(paths, id)
  task.status = status
  task.updated = nowIso()
  if (herdr) task.herdr = herdr
  await writeTask(task)
  return task
}

export async function saveTask(task: Task): Promise<Task> {
  task.updated = nowIso()
  await writeTask(task)
  return task
}

export async function initBoard(
  cwd: string,
  opts: { prefix?: string; agent?: string; project?: string },
): Promise<BoardPaths> {
  const prefix = opts.prefix?.trim() || "dev"
  if (!/^[a-z][a-z0-9_-]*$/i.test(prefix)) fail("prefix must match [a-z][a-z0-9_-]*.")
  const agent = opts.agent?.trim() || "claude"
  const knownInitAgents = ["claude", "grok", "codex", "opencode"]
  if (!knownInitAgents.includes(agent)) {
    fail(`Unknown default agent '${agent}'. Use one of: ${knownInitAgents.join(", ")}`)
  }
  const project = opts.project?.trim() || ""
  if (project && !(await isDirectory(resolve(project)))) {
    fail(`Project path does not exist or is not a directory: ${project}`)
  }
  const paths = await writeInitConfig(cwd, { prefix, agent, project })
  await ensureDir(paths.tasksDir)
  await ensureDir(paths.skillsDir)
  await ensureDir(paths.promptsDir)
  const skillSrc = packagedSkillPath()
  if (!(await pathExists(skillSrc))) {
    fail(`Packaged skill missing at ${skillSrc}`)
  }
  await cp(skillSrc, paths.skillPath)
  const promptSrc = packagedReviewPromptPath()
  if (!(await pathExists(promptSrc))) {
    fail(`Packaged review prompt missing at ${promptSrc}`)
  }
  await cp(promptSrc, paths.reviewPromptPath)
  return paths
}

export async function loadBoard(paths: BoardPaths): Promise<{ config: Config; tasks: Task[] }> {
  const [config, tasks] = await Promise.all([loadConfig(paths), listTasks(paths)])
  return { config, tasks }
}

export { pathsFor }