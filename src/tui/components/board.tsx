import { useEffect, useRef } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { LiveAgentStatus } from "../../lib/herdr.ts"
import { isLaunchLane } from "../../lib/lanes.ts"
import { tasksInLane } from "../../lib/order.ts"
import { LANES, type Lane, type LaneDef, type Task } from "../../lib/types.ts"
import { filterTasks } from "../filter.ts"
import { HINTS_NARROW, HINTS_WIDE, fitHints, hintsForTask } from "../hints.ts"
import { revealLaneInBoard } from "../scroll.ts"
import { tuiColor, useTheme, verticalScrollbarOptions } from "../theme.ts"
import { Column } from "./column.tsx"
import { HintBar } from "./hint-bar.tsx"
import { ToastBar, type ToastInfo } from "./toast.tsx"
import { TopBar, liveRunningCount } from "./top-bar.tsx"

/** Min lane width: 4 lanes at 80 cols. Extra lanes wrap; rows grow to fill. */
export const MIN_LANE_WIDTH = 20
const TOP_BAR_HEIGHT = 1
const HINT_BAR_HEIGHT = 1
const TOAST_HEIGHT = 1

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
  if (n === 1) return [Math.max(1, total)]
  if (n * minWidth > total) return Array.from({ length: n }, () => minWidth)
  const base = Math.max(minWidth, Math.floor(total / n))
  const widths = Array.from({ length: n }, () => base)
  let rest = Math.max(0, total - base * n)
  for (let i = 0; rest > 0 && i < widths.length; i++) {
    widths[i]! += 1
    rest--
  }
  return widths
}

export function lanesPerRow(total: number, min = MIN_LANE_WIDTH): number {
  return Math.max(1, Math.floor(Math.max(1, total) / Math.max(1, min)))
}

export function chunkLanes<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, size)
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n))
  return rows
}

export function boardRowHeight(termHeight: number, hasToast: boolean): number {
  return Math.max(1, termHeight - TOP_BAR_HEIGHT - HINT_BAR_HEIGHT - (hasToast ? TOAST_HEIGHT : 0))
}

export function Board(props: BoardProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { height } = useTerminalDimensions()
  const color = tuiColor()
  const theme = useTheme()
  const scrollbar = verticalScrollbarOptions(theme, color)
  const laneOrder = props.lanes?.length ? props.lanes : LANES
  const lanes = props.singlePane ? [props.focusedLane] : [...laneOrder]
  const perRow = lanesPerRow(props.width)
  const rows = chunkLanes(lanes, perRow)
  const overflow = rows.length > 1
  const widthsByRow = rows.map((row) => splitColumnWidths(props.width, row.length))
  const rowHeight = boardRowHeight(height, props.toast != null)
  const focusedIndex = lanes.indexOf(props.focusedLane)
  const rowIndex = focusedIndex < 0 ? 0 : Math.floor(focusedIndex / perRow)
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
    const index = rowIndex
    const size = rowHeight
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const tryReveal = () => {
      if (cancelled) return
      revealLaneInBoard(scrollRef.current, lane, index, size)
    }
    tryReveal()
    timers.push(setTimeout(tryReveal, 0))
    timers.push(setTimeout(tryReveal, 32))
    return () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
    }
  }, [overflow, focusedIndex, rowIndex, rowHeight, props.focusedLane, props.width])

  const column = (lane: Lane, width: number) => (
    <Column
      key={lane}
      lane={lane}
      name={props.laneDefs?.[lane]?.name}
      tasks={byLane(lane)}
      totalCount={tasksInLane(props.tasks, lane).length}
      width={width}
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
  )

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
          scrollY
          scrollX={false}
          verticalScrollbarOptions={scrollbar}
        >
          {rows.map((row, rowIdx) => (
            <box
              key={row[0]}
              flexDirection="row"
              width="100%"
              height={rowHeight}
              flexShrink={0}
            >
              {row.map((lane, i) => column(lane, widthsByRow[rowIdx]?.[i] ?? MIN_LANE_WIDTH))}
            </box>
          ))}
        </scrollbox>
      ) : (
        <box flexDirection="row" flexGrow={1} flexShrink={1} width="100%">
          {lanes.map((lane, i) => column(lane, widthsByRow[0]?.[i] ?? MIN_LANE_WIDTH))}
        </box>
      )}
      {props.toast ? <ToastBar toast={props.toast} /> : null}
      <HintBar items={hints} />
    </box>
  )
}
