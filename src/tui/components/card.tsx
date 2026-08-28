import { basename, truncateCells } from "../../lib/text.ts"
import type { Task } from "../../lib/types.ts"
import { theme, tuiColor } from "../theme.ts"

type CardProps = {
  task: Task
  width: number
  focused: boolean
  selected: boolean
  launching: boolean
  onMouseDown: () => void
}

export function Card(props: CardProps) {
  const color = tuiColor()
  const inner = Math.max(4, props.width - 2)
  const marker = props.selected ? "*" : props.focused ? ">" : " "
  const title = truncateCells(`${marker} ${props.task.id}  ${props.task.title}`, inner)
  const metaRaw = props.launching
    ? "starting…"
    : `${props.task.agent}  ${basename(props.task.project)}`
  const meta = truncateCells(`  ${metaRaw}`, inner)
  const bg = props.selected ? theme.selectedBg : theme.cardBg

  return (
    <box
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
