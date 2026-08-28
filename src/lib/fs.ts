import { mkdir, rename, rm, stat } from "node:fs/promises"
import { dirname, join } from "node:path"

export async function pathExists(path: string): Promise<boolean> {
  return await Bun.file(path).exists()
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isDirectory()
  } catch {
    return false
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export async function readText(path: string): Promise<string> {
  return await Bun.file(path).text()
}

export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  await ensureDir(dirname(path))
  const tmp = join(dirname(path), `.${Bun.hash(path).toString(16)}.${process.pid}.tmp`)
  try {
    await Bun.write(tmp, contents)
    await rename(tmp, path)
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}
