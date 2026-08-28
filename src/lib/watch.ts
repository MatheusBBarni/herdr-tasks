import { watch, type FSWatcher } from "node:fs"
import type { BoardPaths } from "./root.ts"

export function watchTasks(paths: BoardPaths, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const fire = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      onChange()
    }, 80)
  }
  let watcher: FSWatcher
  try {
    watcher = watch(paths.tasksDir, { persistent: true }, (_event, filename) => {
      if (typeof filename === "string" && filename.includes(".tmp")) return
      fire()
    })
  } catch {
    return () => {}
  }
  watcher.on("error", () => {})
  return () => {
    if (timer) clearTimeout(timer)
    watcher.close()
  }
}
