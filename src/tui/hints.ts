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
  { action: "quit", key: "q" },
]

function hintWidth(hint: Hint): number {
  return hint.action.length + 2 + hint.key.length
}

export function fitHints(hints: readonly Hint[], width: number): Hint[] {
  const items = [...hints]
  const total = (list: Hint[]) =>
    list.reduce((sum, hint, i) => sum + hintWidth(hint) + (i > 0 ? 2 : 0), 0)
  for (const action of ["help", "preview", "edit", "card"]) {
    if (total(items) <= width) break
    const idx = items.findIndex((hint) => hint.action === action)
    if (idx >= 0) items.splice(idx, 1)
  }
  return items
}
