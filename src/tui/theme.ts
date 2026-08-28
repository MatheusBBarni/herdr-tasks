import { colorEnabled } from "../lib/color.ts"

export function tuiColor(): boolean {
  return colorEnabled(process.stdout)
}

export const theme = {
  fg: "#e6edf3",
  muted: "#8b949e",
  border: "#30363d",
  focus: "#58a6ff",
  selectedBg: "#1f3a5f",
  cardBg: "#161b22",
  bg: "#0d1117",
  error: "#f85149",
  backlog: "#8b949e",
  progress: "#d29922",
  done: "#3fb950",
} as const

export function laneColor(lane: "backlog" | "in_progress" | "done"): string {
  if (lane === "in_progress") return theme.progress
  if (lane === "done") return theme.done
  return theme.backlog
}
