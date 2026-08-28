import type { LiveAgentStatus } from "../../lib/herdr.ts"
import { LANES, type Lane, type Task } from "../../lib/types.ts"
import { HINTS_NARROW, HINTS_WIDE, fitHints, hintsForTask } from "../hints.ts"
import { Column } from "./column.tsx"
import { HintBar } from "./hint-bar.tsx"
import { ToastBar, type ToastInfo } from "./toast.tsx"

type BoardProps = {
  tasks: Task[]
  width: number
  singlePane: boolean
  focusedLane: Lane
  focusedId: string | null
  selectedId: string | null
  launchingIds: ReadonlySet<string>
  agentStatuses: ReadonlyMap<string, LiveAgentStatus>
  onFocusTask: (id: string) => void
  onDrop: (lane: Lane) => void
  toast: ToastInfo | null
}

export function Board(props: BoardProps) {
  const lanes = props.singlePane ? [props.focusedLane] : [...LANES]
  const colWidth = Math.max(12, Math.floor(props.width / lanes.length))
  const byLane = (lane: Lane) => props.tasks.filter((task) => task.status === lane)
  const focusedTask = props.tasks.find((task) => task.id === props.focusedId) ?? null
  const hints = fitHints(
    hintsForTask(props.singlePane ? HINTS_NARROW : HINTS_WIDE, focusedTask),
    props.width,
  )

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" flexGrow={1} flexShrink={1} width="100%">
        {lanes.map((lane) => (
          <Column
            key={lane}
            lane={lane}
            tasks={byLane(lane)}
            width={colWidth}
            focused={props.focusedLane === lane}
            focusedId={props.focusedId}
            selectedId={props.selectedId}
            launchingIds={props.launchingIds}
            agentStatuses={props.agentStatuses}
            onFocusTask={props.onFocusTask}
            onDrop={props.onDrop}
          />
        ))}
      </box>
      {props.toast ? <ToastBar toast={props.toast} /> : null}
      <HintBar items={hints} />
    </box>
  )
}
