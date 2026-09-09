import { useEffect, useRef } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { LiveAgentStatus } from "../../lib/herdr.ts"
import { defaultLaneName, isLaunchLane } from "../../lib/lanes.ts"
import { truncateCells } from "../../lib/text.ts"
import type { Lane, LaneDef, Task } from "../../lib/types.ts"
import { CARD_GAP, revealTaskInLane } from "../scroll.ts"
import { tuiColor, useTheme } from "../theme.ts"
import { Card } from "./card.tsx"

type ColumnProps = {
  lane: Lane
  name?: string
  tasks: Task[]
  width: number
  focused: boolean
  focusedId: string | null
  selectedId: string | null
  launchingIds: ReadonlySet<string>
  agentStatuses: ReadonlyMap<string, LiveAgentStatus>
  defaultProject: string
  onFocusTask: (id: string) => void
  onDrop: (lane: Lane) => void
  laneDefs?: Record<string, LaneDef>
}

export function columnHeading(lane: Lane, count: number, name?: string): string {
  const label = (name?.trim() || defaultLaneName(lane)).toUpperCase()
  return `${label} · ${count}`
}

export function Column(props: ColumnProps) {
  const color = tuiColor()
  const theme = useTheme()
  const { height } = useTerminalDimensions()
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const focusedIndex = props.focusedId
    ? props.tasks.findIndex((task) => task.id === props.focusedId)
    : -1
  const inner = Math.max(0, props.width - 2)
  const heading = truncateCells(columnHeading(props.lane, props.tasks.length, props.name), inner)
  const titleFg = color ? (props.focused ? theme.focus : theme.muted) : undefined
  const borderFg = color ? (props.focused ? theme.focus : theme.border) : undefined
  const muted = color ? theme.muted : undefined

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
      flexGrow={0}
      flexShrink={0}
      width={props.width}
      height="100%"
      border
      borderColor={borderFg}
      onMouseUp={() => props.onDrop(props.lane)}
    >
      <box flexShrink={0} width="100%" flexDirection="column">
        <text fg={titleFg}>{heading}</text>
        <text fg={muted}>{"─".repeat(inner)}</text>
      </box>
      <scrollbox ref={scrollRef} flexGrow={1} width="100%" height="100%" scrollY>
        {props.tasks.length === 0 ? null : (
          <box flexDirection="column" gap={CARD_GAP} width="100%">
            {props.tasks.map((task) => (
              <Card
                key={task.id}
                task={task}
                width={props.width}
                focused={props.focusedId === task.id}
                selected={props.selectedId === task.id}
                launching={props.launchingIds.has(task.id)}
                defaultProject={props.defaultProject}
                agentStatus={
                  isLaunchLane(task.status, props.laneDefs) && task.herdr.pane_id
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
