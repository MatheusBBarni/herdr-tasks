import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { CliError } from "../lib/errors.ts"
import { requireBoardRoot, searchStart } from "../lib/root.ts"
import { loadBoard } from "../lib/store.ts"
import { App } from "./app.tsx"

export async function runBoard(): Promise<void> {
  const start = searchStart()
  const paths = await requireBoardRoot(start)
  const board = await loadBoard(paths)
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useMouse: true,
  })
  createRoot(renderer).render(
    <App
      paths={paths}
      cwd={start}
      initialConfig={board.config}
      initialTasks={board.tasks}
    />,
  )
}

export { CliError }
