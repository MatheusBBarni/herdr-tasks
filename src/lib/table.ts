import { cellWidth, truncateCells } from "./text.ts"

export type Column = {
  key: string
  header: string
  min?: number
  flex?: boolean
}

export function formatTable(
  columns: Column[],
  rows: Record<string, string>[],
  width = process.stdout.columns ?? 80,
): string {
  if (rows.length === 0) return ""
  const widths = columns.map((col) => {
    let w = cellWidth(col.header)
    for (const row of rows) {
      w = Math.max(w, cellWidth(row[col.key] ?? ""))
    }
    return Math.max(col.min ?? 1, w)
  })
  const gaps = Math.max(0, columns.length - 1) * 2
  let total = widths.reduce((a, b) => a + b, 0) + gaps
  if (total > width) {
    let overflow = total - width
    for (let i = columns.length - 1; i >= 0 && overflow > 0; i--) {
      const col = columns[i]
      const current = widths[i] ?? 1
      const min = col?.min ?? 4
      const reducible = Math.max(0, current - min)
      const cut = Math.min(reducible, overflow)
      if (widths[i] !== undefined) widths[i] = current - cut
      overflow -= cut
    }
  }
  const header = columns
    .map((col, i) => pad(col.header, widths[i] ?? col.header.length))
    .join("  ")
  const lines = rows.map((row) =>
    columns.map((col, i) => pad(row[col.key] ?? "", widths[i] ?? 0)).join("  "),
  )
  return [header, ...lines].join("\n")
}

function pad(text: string, width: number): string {
  const clipped = truncateCells(text, width)
  const extra = Math.max(0, width - cellWidth(clipped))
  return clipped + " ".repeat(extra)
}
