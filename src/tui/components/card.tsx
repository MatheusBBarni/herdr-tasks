import type { LiveAgentStatus } from "../../lib/herdr.ts"
import { basename, truncateCells } from "../../lib/text.ts"
import type { ThemePalette } from "../../lib/themes.ts"
import type { Lane, Task } from "../../lib/types.ts"
import { CARD_HEIGHT, cardRenderableId } from "../scroll.ts"
import { tuiColor, useTheme } from "../theme.ts"

export type CardTone = "muted" | "accent" | "warn" | "ok"

export type CardStatusView = {
  label: string
  tone: CardTone
}

type CardProps = {
  task: Task
  width: number
  focused: boolean
  selected: boolean
  launching: boolean
  defaultProject: string
  agentStatus?: LiveAgentStatus
  onMouseDown: () => void
}

export function sameProject(a: string, b: string): boolean {
  return a.replace(/[\\/]+$/, "") === b.replace(/[\\/]+$/, "")
}

export function cardInnerWidth(columnWidth: number, selected: boolean): number {
  return Math.max(4, columnWidth - 6 - (selected ? 1 : 0))
}

export function cardTitleLine(id: string, title: string, inner: number): string {
  return truncateCells(`${id}  ${title}`, inner)
}

export function cardStatusView(opts: {
  lane: Lane
  launching: boolean
  agentStatus?: LiveAgentStatus
}): CardStatusView {
  if (opts.launching) return { label: "starting…", tone: "warn" }
  if (opts.lane === "done") return { label: "✓ done", tone: "ok" }
  if (opts.agentStatus) {
    switch (opts.agentStatus) {
      case "idle":
        return { label: "idle", tone: "muted" }
      case "working":
        return { label: "working", tone: "accent" }
      case "blocked":
        return { label: "? blocked", tone: "warn" }
      case "done":
        return { label: "✓ done", tone: "ok" }
      case "gone":
        return { label: "gone", tone: "muted" }
      case "unknown":
        return { label: "unknown", tone: "muted" }
    }
  }
  if (opts.lane === "in_progress") return { label: "in_progress", tone: "warn" }
  if (opts.lane === "review") return { label: "review", tone: "accent" }
  return { label: "idle", tone: "muted" }
}

export function cardAgentLine(opts: {
  agent: string
  project: string
  defaultProject: string
}): string {
  if (opts.defaultProject && sameProject(opts.project, opts.defaultProject)) {
    return opts.agent
  }
  return `${opts.agent}  ${basename(opts.project)}`
}

export function toneColor(tone: CardTone, theme: ThemePalette): string {
  switch (tone) {
    case "accent":
      return theme.focus
    case "warn":
      return theme.progress
    case "ok":
      return theme.done
    default:
      return theme.muted
  }
}

export function Card(props: CardProps) {
  const color = tuiColor()
  const theme = useTheme()
  const inner = cardInnerWidth(props.width, props.selected)
  const status = cardStatusView({
    lane: props.task.status,
    launching: props.launching,
    agentStatus: props.agentStatus,
  })
  const title = cardTitleLine(props.task.id, props.task.title, inner)
  const agent = truncateCells(
    cardAgentLine({
      agent: props.task.agent,
      project: props.task.project,
      defaultProject: props.defaultProject,
    }),
    inner,
  )
  const statusLabel = truncateCells(status.label, inner)
  const done = props.task.status === "done"
  const highlight = props.focused || props.selected
  const borderFg = color ? (highlight ? theme.focus : theme.border) : undefined
  const fill = color && highlight ? theme.selectedBg : undefined
  const titleFg = color ? (done ? theme.muted : theme.fg) : undefined
  const statusFg = color ? toneColor(status.tone, theme) : undefined
  const muted = color ? theme.muted : undefined
  const accent = color ? theme.focus : undefined

  return (
    <box
      id={cardRenderableId(props.task.id)}
      flexDirection="row"
      width="100%"
      height={CARD_HEIGHT}
      flexShrink={0}
      overflow="hidden"
      border
      borderStyle="single"
      borderColor={borderFg}
      backgroundColor={fill}
      onMouseDown={props.onMouseDown}
    >
      {props.selected ? <box width={1} backgroundColor={accent} /> : null}
      <box flexGrow={1} flexDirection="column" paddingLeft={1} paddingRight={1}>
        <text fg={titleFg}>{title}</text>
        <text fg={statusFg}>{statusLabel}</text>
        <text fg={muted}>{agent}</text>
      </box>
    </box>
  )
}
