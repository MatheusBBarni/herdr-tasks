import type { LiveAgentStatus } from "../../lib/herdr.ts"
import { isLaunchLane } from "../../lib/lanes.ts"
import { tasksInLane } from "../../lib/order.ts"
import { LANES, type Lane, type LaneDef, type Task } from "../../lib/types.ts"
import { HINTS_NARROW, HINTS_WIDE, fitHints, hintsForTask } from "../hints.ts"
import { Column } from "./column.tsx"
import { HintBar } from "./hint-bar.tsx"
import { ToastBar, type ToastInfo } from "./toast.tsx"
import { TopBar, liveRunningCount } from "./top-bar.tsx"

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
  onFocusTask: (id: string) => void
  onDrop: (lane: Lane) => void
  toast: ToastInfo | null
  lanes?: readonly string[]
  laneDefs?: Record<string, LaneDef>
}

export function splitColumnWidths(total: number, count: number): number[] {
  const n = Math.max(1, count)
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
  const laneOrder = props.lanes?.length ? props.lanes : LANES
  const lanes = props.singlePane ? [props.focusedLane] : [...laneOrder]
  const colWidths = splitColumnWidths(props.width, lanes.length)
  const byLane = (lane: Lane) => tasksInLane(props.tasks, lane)
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

  return (
    <box flexDirection="column" width="100%" height="100%">
      <TopBar
        width={props.width}
        running={running}
        boardName={props.boardName}
        prefix={props.prefix}
      />
      <box flexDirection="row" flexGrow={1} flexShrink={1} width="100%">
        {lanes.map((lane, i) => (
          <Column
            key={lane}
            lane={lane}
            name={props.laneDefs?.[lane]?.name}
            tasks={byLane(lane)}
            width={colWidths[i] ?? 12}
            focused={props.focusedLane === lane}
            focusedId={props.focusedId}
            selectedId={props.selectedId}
            launchingIds={props.launchingIds}
            agentStatuses={props.agentStatuses}
            defaultProject={props.defaultProject}
            onFocusTask={props.onFocusTask}
            onDrop={props.onDrop}
            laneDefs={props.laneDefs}
          />
        ))}
      </box>
      {props.toast ? <ToastBar toast={props.toast} /> : null}
      <HintBar items={hints} />
    </box>
  )
}
