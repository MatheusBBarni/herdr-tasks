import type { LiveAgentStatus } from "../../lib/herdr.ts"
import { basename, truncateCells } from "../../lib/text.ts"
import type { Task } from "../../lib/types.ts"
import { cardRenderableId } from "../scroll.ts"
import { tuiColor, useTheme } from "../theme.ts"

type CardProps = {
  task: Task
  width: number
  focused: boolean
  selected: boolean
  launching: boolean
  agentStatus?: LiveAgentStatus
  onMouseDown: () => void
}

export function cardMeta(opts: {
  launching: boolean
  status?: LiveAgentStatus
  type?: string
  agent: string
  project: string
}): string {
  if (opts.launching) return "starting…"
  const project = basename(opts.project)
  const rest = opts.status ? `${opts.status}  ${opts.agent}  ${project}` : `${opts.agent}  ${project}`
  const type = opts.type?.trim()
  return type ? `${type}  ${rest}` : rest
}

export function cardMetaLine(
  width: number,
  opts: {
    launching: boolean
    status?: LiveAgentStatus
    type?: string
    agent: string
    project: string
  },
): string {
  const inner = Math.max(4, width - 2)
  return truncateCells(`  ${cardMeta(opts)}`, inner)
}

export function Card(props: CardProps) {
  const color = tuiColor()
  const theme = useTheme()
  const inner = Math.max(4, props.width - 2)
  const marker = props.selected ? "*" : props.focused ? ">" : " "
  const title = truncateCells(`${marker} ${props.task.id}  ${props.task.title}`, inner)
  const meta = cardMetaLine(props.width, {
    launching: props.launching,
    status: props.agentStatus,
    type: props.task.type,
    agent: props.task.agent,
    project: props.task.project,
  })
  const bg = props.selected ? theme.selectedBg : theme.cardBg

  return (
    <box
      id={cardRenderableId(props.task.id)}
      flexDirection="column"
      width="100%"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={color ? bg : undefined}
      onMouseDown={props.onMouseDown}
    >
      <text fg={color ? (props.focused ? theme.focus : theme.fg) : undefined}>{title}</text>
      <text fg={color ? theme.muted : undefined}>{meta}</text>
    </box>
  )
}
