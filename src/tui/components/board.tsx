import { useEffect, useRef } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { LiveAgentStatus } from "../../lib/herdr.ts"
import { isLaunchLane } from "../../lib/lanes.ts"
import { tasksInLane } from "../../lib/order.ts"
import { LANES, type Lane, type LaneDef, type Task } from "../../lib/types.ts"
import { filterTasks } from "../filter.ts"
import { HINTS_NARROW, HINTS_WIDE, fitHints, hintsForTask } from "../hints.ts"
import { revealLaneInBoard } from "../scroll.ts"
import { Column } from "./column.tsx"
import { HintBar } from "./hint-bar.tsx"
import { ToastBar, type ToastInfo } from "./toast.tsx"
import { TopBar, liveRunningCount } from "./top-bar.tsx"

/** Matches 4 lanes at 80 cols. Extra lanes keep this width and scroll. */
export const MIN_LANE_WIDTH = 20

type BoardProps = {
  tasks: Task[]
  width: number
  boardName: string
  prefix: string
  defaultProject: string
  singlePane: boolean
  focusedLane: Lane
  focusedId: string | null
  selectedId: string | null
  launchingIds: ReadonlySet<string>
  agentStatuses: ReadonlyMap<string, LiveAgentStatus>
  filterQueries?: Partial<Record<Lane, string>>
  filterLane?: Lane | null
  onFilterChange?: (lane: Lane, query: string) => void
  onFilterSubmit?: () => void
  onFilterFocus?: (lane: Lane) => void
  onFocusTask: (id: string) => void
  onDrop: (lane: Lane) => void
  toast: ToastInfo | null
  lanes?: readonly string[]
  laneDefs?: Record<string, LaneDef>
}

export function splitColumnWidths(total: number, count: number, min = MIN_LANE_WIDTH): number[] {
  const n = Math.max(1, count)
  const minWidth = Math.max(1, min)
  if (n * minWidth > total) {
    return Array.from({ length: n }, () => minWidth)
  }
  const base = Math.max(1, Math.floor(total / n))
  const widths = Array.from({ length: n }, () => base)
  let rest = Math.max(0, total - base * n)
  for (let i = 0; rest > 0 && i < widths.length; i++) {
    widths[i]! += 1
    rest--
  }
  return widths
}

export function Board(props: BoardProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const laneOrder = props.lanes?.length ? props.lanes : LANES
  const lanes = props.singlePane ? [props.focusedLane] : [...laneOrder]
  const colWidths = splitColumnWidths(props.width, lanes.length)
  const contentWidth = colWidths.reduce((sum, width) => sum + width, 0)
  const overflow = contentWidth > props.width
  const focusedIndex = lanes.indexOf(props.focusedLane)
  const focusedWidth = colWidths[focusedIndex] ?? MIN_LANE_WIDTH
  const byLane = (lane: Lane) => {
    const all = tasksInLane(props.tasks, lane)
    return filterTasks(all, props.filterQueries?.[lane] ?? "")
  }
  const focusedTask = props.tasks.find((task) => task.id === props.focusedId) ?? null
  const hints = fitHints(
    hintsForTask(
      props.singlePane ? HINTS_NARROW : HINTS_WIDE,
      focusedTask,
      props.selectedId != null,
    ),
    props.width,
  )
  const liveCount = props.tasks.filter((task) => isLaunchLane(task.status, props.laneDefs)).length
  const running = liveRunningCount({
    launchingIds: props.launchingIds,
    agentStatuses: props.agentStatuses,
    inProgressCount: liveCount,
  })

  useEffect(() => {
    if (!overflow || focusedIndex < 0) return
    const lane = props.focusedLane
    const index = focusedIndex
    const width = focusedWidth
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const tryReveal = () => {
      if (cancelled) return
      revealLaneInBoard(scrollRef.current, lane, index, width)
    }
    tryReveal()
    timers.push(setTimeout(tryReveal, 0))
    timers.push(setTimeout(tryReveal, 32))
    return () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
    }
  }, [overflow, focusedIndex, focusedWidth, props.focusedLane, props.width])

  const columns = lanes.map((lane, i) => (
    <Column
      key={lane}
      lane={lane}
      name={props.laneDefs?.[lane]?.name}
      tasks={byLane(lane)}
      totalCount={tasksInLane(props.tasks, lane).length}
      width={colWidths[i] ?? MIN_LANE_WIDTH}
      focused={props.focusedLane === lane}
      focusedId={props.focusedId}
      selectedId={props.selectedId}
      launchingIds={props.launchingIds}
      agentStatuses={props.agentStatuses}
      defaultProject={props.defaultProject}
      filterQuery={props.filterQueries?.[lane] ?? ""}
      filterEditing={props.filterLane === lane}
      onFilterChange={(query) => props.onFilterChange?.(lane, query)}
      onFilterSubmit={() => props.onFilterSubmit?.()}
      onFilterFocus={() => props.onFilterFocus?.(lane)}
      onFocusTask={props.onFocusTask}
      onDrop={props.onDrop}
      laneDefs={props.laneDefs}
    />
  ))

  return (
    <box flexDirection="column" width="100%" height="100%">
      <TopBar
        width={props.width}
        running={running}
        boardName={props.boardName}
        prefix={props.prefix}
      />
      {overflow ? (
        <scrollbox
          ref={scrollRef}
          flexGrow={1}
          flexShrink={1}
          width="100%"
          height="100%"
          scrollX
          scrollY={false}
        >
          <box flexDirection="row" width={contentWidth} height="100%" flexShrink={0}>
            {columns}
          </box>
        </scrollbox>
      ) : (
        <box flexDirection="row" flexGrow={1} flexShrink={1} width="100%">
          {columns}
        </box>
      )}
      {props.toast ? <ToastBar toast={props.toast} /> : null}
      <HintBar items={hints} />
    </box>
  )
}
