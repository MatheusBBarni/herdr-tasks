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

export async function findBoardRoot(start = process.cwd()): Promise<string | null> {
  for (const dir of walkAncestors(start)) {
    if (await pathExists(join(dir, DATA_DIR_NAME, CONFIG_NAME))) return dir
  }
  return null
}

export async function requireBoardRoot(start = process.cwd()): Promise<BoardPaths> {
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
