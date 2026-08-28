import { dirname, join, resolve } from "node:path"
import { fail } from "./errors.ts"
import { isDirectory, pathExists } from "./fs.ts"

export const DATA_DIR_NAME = ".herdr-tasks"
export const CONFIG_NAME = "config.toml"

export type BoardPaths = {
  boardRoot: string
  dataDir: string
  configPath: string
  tasksDir: string
  skillsDir: string
  skillPath: string
}

export function pathsFor(boardRoot: string): BoardPaths {
  const dataDir = join(boardRoot, DATA_DIR_NAME)
  return {
    boardRoot,
    dataDir,
    configPath: join(dataDir, CONFIG_NAME),
    tasksDir: join(dataDir, "tasks"),
    skillsDir: join(dataDir, "skills", "htasks"),
    skillPath: join(dataDir, "skills", "htasks", "SKILL.md"),
  }
}

export async function findBoardRoot(start = process.cwd()): Promise<string | null> {
  let dir = resolve(start)
  while (true) {
    if (await pathExists(join(dir, DATA_DIR_NAME, CONFIG_NAME))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
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
