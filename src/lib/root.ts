import { dirname, join, resolve } from "node:path"
import { fail } from "./errors.ts"
import { isDirectory, pathExists } from "./fs.ts"

export const DATA_DIR_NAME = ".herdr-tasks"
export const CONFIG_NAME = "config.toml"
export const REVIEW_PROMPT_REL = `${DATA_DIR_NAME}/prompts/review.md`

export type BoardPaths = {
  boardRoot: string
  dataDir: string
  configPath: string
  tasksDir: string
  skillsDir: string
  skillPath: string
  promptsDir: string
  reviewPromptPath: string
}

export function pathsFor(boardRoot: string): BoardPaths {
  const dataDir = join(boardRoot, DATA_DIR_NAME)
  const promptsDir = join(dataDir, "prompts")
  return {
    boardRoot,
    dataDir,
    configPath: join(dataDir, CONFIG_NAME),
    tasksDir: join(dataDir, "tasks"),
    skillsDir: join(dataDir, "skills", "htasks"),
    skillPath: join(dataDir, "skills", "htasks", "SKILL.md"),
    promptsDir,
    reviewPromptPath: join(promptsDir, "review.md"),
  }
}

export function walkAncestors(start: string): string[] {
  const dirs: string[] = []
  let dir = resolve(start)
  while (true) {
    dirs.push(dir)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return dirs
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickPath(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

/** Workspace / worktree cwd from Herdr's plugin invocation context. */
export function cwdFromPluginContextJson(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    const root = asRecord(parsed)
    if (!root) return null
    const workspace = asRecord(root.workspace)
    const worktree = asRecord(root.worktree) ?? asRecord(workspace?.worktree)
    const pane =
      asRecord(root.pane) ?? asRecord(root.focused_pane) ?? asRecord(root.focusedPane)
    return pickPath(
      worktree?.checkout_path,
      worktree?.path,
      worktree?.cwd,
      worktree?.repo_root,
      workspace?.cwd,
      workspace?.path,
      workspace?.root,
      pane?.foreground_cwd,
      pane?.cwd,
      root.cwd,
    )
  } catch {
    return null
  }
}

/**
 * Directory to start walking for `.herdr-tasks/config.toml`.
 * Order: HTASKS_ROOT, then workspace/worktree cwd from HERDR_PLUGIN_CONTEXT_JSON, then cwd.
 */
export function searchStart(
  env: NodeJS.Dict<string | undefined> = process.env,
  fallback = process.cwd(),
): string {
  const override = env.HTASKS_ROOT?.trim()
  if (override) return resolve(override)
  const fromContext = cwdFromPluginContextJson(env.HERDR_PLUGIN_CONTEXT_JSON)
  if (fromContext) return resolve(fromContext)
  return resolve(fallback)
}

export async function findBoardRoot(start = searchStart()): Promise<string | null> {
  for (const dir of walkAncestors(start)) {
    if (await pathExists(join(dir, DATA_DIR_NAME, CONFIG_NAME))) return dir
  }
  return null
}

export async function requireBoardRoot(start = searchStart()): Promise<BoardPaths> {
  const root = await findBoardRoot(start)
  if (!root) {
    fail("No htasks board found. Run `htasks init` in this directory.")
  }
  return pathsFor(root)
}

export async function resolveProjectPath(boardRoot: string, project: string): Promise<string> {
  const abs = resolve(project.startsWith("/") || /^[A-Za-z]:[\\/]/.test(project) ? project : join(boardRoot, project))
  if (!(await isDirectory(abs))) {
    fail(`Project path does not exist or is not a directory: ${project}`)
  }
  return abs
}

export function packagedSkillPath(): string {
  return join(import.meta.dir, "../../skills/htasks/SKILL.md")
}

export function packagedReviewPromptPath(): string {
  return join(import.meta.dir, "../../skills/htasks/review-prompt.md")
}
