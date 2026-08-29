import { useEffect, useRef } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { LiveAgentStatus } from "../../lib/herdr.ts"
import { laneLabel } from "../../lib/move.ts"
import type { Lane, Task } from "../../lib/types.ts"
import { CARD_GAP, revealTaskInLane } from "../scroll.ts"
import { laneColor, tuiColor, useTheme } from "../theme.ts"
import { Card } from "./card.tsx"

type ColumnProps = {
  lane: Lane
  tasks: Task[]
  width: number
  focused: boolean
  focusedId: string | null
  selectedId: string | null
  launchingIds: ReadonlySet<string>
  agentStatuses: ReadonlyMap<string, LiveAgentStatus>
  onFocusTask: (id: string) => void
  onDrop: (lane: Lane) => void
}

export function Column(props: ColumnProps) {
  const color = tuiColor()
  const theme = useTheme()
  const { height } = useTerminalDimensions()
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const focusedIndex = props.focusedId
    ? props.tasks.findIndex((task) => task.id === props.focusedId)
    : -1
  const title = `${laneLabel(props.lane)} ${props.tasks.length}`

  useEffect(() => {
    if (focusedIndex < 0 || !props.focusedId) return
    const taskId = props.focusedId
    const index = focusedIndex
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []

    const tryReveal = () => {
      if (cancelled) return
      revealTaskInLane(scrollRef.current, taskId, index)
    }

    tryReveal()
    timers.push(setTimeout(tryReveal, 0))
    timers.push(setTimeout(tryReveal, 32))

    return () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
    }
  }, [focusedIndex, props.focusedId, height])

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      width={props.width}
      height="100%"
      border
      borderColor={color ? (props.focused ? theme.focus : theme.border) : undefined}
      title={title}
      titleColor={color ? laneColor(props.lane, theme) : undefined}
      onMouseUp={() => props.onDrop(props.lane)}
    >
      <scrollbox ref={scrollRef} flexGrow={1} width="100%" height="100%" scrollY>
        {props.tasks.length === 0 ? (
          <text fg={color ? theme.muted : undefined}>  empty</text>
        ) : (
          <box flexDirection="column" gap={CARD_GAP} width="100%">
            {props.tasks.map((task) => (
              <Card
                key={task.id}
                task={task}
                width={props.width}
                focused={props.focusedId === task.id}
                selected={props.selectedId === task.id}
                launching={props.launchingIds.has(task.id)}
                agentStatus={
                  task.status === "in_progress" && task.herdr.pane_id
                    ? props.agentStatuses.get(task.herdr.pane_id)
                    : undefined
                }
                onMouseDown={() => props.onFocusTask(task.id)}
              />
            ))}
          </box>
        )}
      </scrollbox>
    </box>
  )
}
