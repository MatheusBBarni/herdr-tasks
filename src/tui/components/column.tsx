import type { Lane, Task } from "../../lib/types.ts"
import { laneLabel } from "../../lib/move.ts"
import { theme, laneColor, tuiColor } from "../theme.ts"
import { Card } from "./card.tsx"

type ColumnProps = {
  lane: Lane
  tasks: Task[]
  width: number
  focused: boolean
  focusedId: string | null
  selectedId: string | null
  launchingIds: ReadonlySet<string>
  onFocusTask: (id: string) => void
  onDrop: (lane: Lane) => void
}

export function Column(props: ColumnProps) {
  const color = tuiColor()
  const title = `${laneLabel(props.lane)} ${props.tasks.length}`
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      width={props.width}
      height="100%"
      border
      borderColor={color ? (props.focused ? theme.focus : theme.border) : undefined}
      title={title}
      titleColor={color ? laneColor(props.lane) : undefined}
      onMouseUp={() => props.onDrop(props.lane)}
    >
      <scrollbox flexGrow={1} width="100%" height="100%">
        {props.tasks.length === 0 ? (
          <text fg={color ? theme.muted : undefined}>  empty</text>
        ) : (
          <box flexDirection="column" gap={1} width="100%">
            {props.tasks.map((task) => (
              <Card
                key={task.id}
                task={task}
                width={props.width}
                focused={props.focusedId === task.id}
                selected={props.selectedId === task.id}
                launching={props.launchingIds.has(task.id)}
                onMouseDown={() => props.onFocusTask(task.id)}
              />
            ))}
          </box>
        )}
      </scrollbox>
    </box>
  )
}
