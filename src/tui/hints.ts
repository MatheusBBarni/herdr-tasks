import { hasHerdrLayout } from "../lib/herdr.ts"
import type { Task } from "../lib/types.ts"

export type Hint = {
  action: string
  key: string
}

export const HINTS_WIDE: Hint[] = [
  { action: "select", key: "space" },
  { action: "move", key: "h/l" },
  { action: "new", key: "n" },
  { action: "edit", key: "e" },
  { action: "preview", key: "enter" },
  { action: "help", key: "?" },
  { action: "open", key: "o" },
  { action: "set", key: "s" },
  { action: "quit", key: "q" },
]

export const HINTS_NARROW: Hint[] = [
  { action: "lane", key: "h/l" },
  { action: "card", key: "j/k" },
  { action: "select", key: "space" },
  { action: "new", key: "n" },
  { action: "edit", key: "e" },
  { action: "preview", key: "enter" },
  { action: "help", key: "?" },
  { action: "open", key: "o" },
  { action: "set", key: "s" },
  { action: "quit", key: "q" },
]

function hintWidth(hint: Hint): number {
  return hint.action.length + 2 + hint.key.length
}

export function hintsForTask(base: readonly Hint[], task: Task | null): Hint[] {
  const items = [...base]
  if (task?.status !== "done" || !hasHerdrLayout(task)) return items
  const close: Hint = { action: "close", key: "c" }
  const openIdx = items.findIndex((hint) => hint.action === "open")
  if (openIdx >= 0) {
    items[openIdx] = close
    return items
  }
  const quitIdx = items.findIndex((hint) => hint.action === "quit")
  items.splice(quitIdx >= 0 ? quitIdx : items.length, 0, close)
  return items
}

export function fitHints(hints: readonly Hint[], width: number): Hint[] {
  const items = [...hints]
  const total = (list: Hint[]) =>
    list.reduce((sum, hint, i) => sum + hintWidth(hint) + (i > 0 ? 2 : 0), 0)
  for (const action of ["help", "preview", "open", "close", "edit", "card", "set"]) {
    if (total(items) <= width) break
    const idx = items.findIndex((hint) => hint.action === action)
    if (idx >= 0) items.splice(idx, 1)
  }
  return items
}
