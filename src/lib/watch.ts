import { watch, type FSWatcher } from "node:fs"
import type { BoardPaths } from "./root.ts"

export function watchTasks(paths: BoardPaths, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const fire = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      onChange()
    }, 80)
  }
  const watchers: FSWatcher[] = []
  const start = (dir: string, filter?: (filename: string | null) => boolean) => {
    try {
      const watcher = watch(dir, { persistent: true }, (_event, filename) => {
        if (typeof filename === "string" && filename.includes(".tmp")) return
        if (filter && !filter(typeof filename === "string" ? filename : null)) return
        fire()
      })
      watcher.on("error", () => {})
      watchers.push(watcher)
    } catch {
      // directory may not exist yet
    }
  }
  start(paths.tasksDir)
  start(paths.dataDir, (name) => !name || name === "config.toml")
  return () => {
    clearTimeout(timer)
    for (const watcher of watchers) watcher.close()
  }
}
