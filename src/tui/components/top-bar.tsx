import type { LiveAgentStatus } from "../../lib/herdr.ts"
import { cellWidth, truncateCells } from "../../lib/text.ts"
import { tuiColor, useTheme } from "../theme.ts"

export type TopBarPieces = {
  brand: string
  running: string
  showRunning: boolean
  center: string
  right: string
  leftPad: number
  rightPad: number
}

export function formatTopBar(opts: {
  width: number
  running: number
  boardName: string
  prefix: string
}): TopBarPieces {
  const brand = "htasks"
  const running = `  • ${opts.running} running`
  const right = opts.prefix
  let showRunning = true
  let leftW = cellWidth(brand) + cellWidth(running)
  let rightW = cellWidth(right)
  if (leftW + rightW + 1 > opts.width) {
    showRunning = false
    leftW = cellWidth(brand)
  }
  if (leftW + rightW + 1 > opts.width) {
    rightW = 0
  }
  const rest = Math.max(0, opts.width - leftW - rightW)
  const center = truncateCells(opts.boardName, rest > 2 ? rest - 2 : 0)
  const leftover = Math.max(0, rest - cellWidth(center))
  const leftPad = Math.floor(leftover / 2)
  const rightPad = leftover - leftPad
  return {
    brand,
    running,
    showRunning,
    center,
    right: rightW > 0 ? right : "",
    leftPad,
    rightPad,
  }
}

export function liveRunningCount(opts: {
  launchingIds: ReadonlySet<string>
  agentStatuses: ReadonlyMap<string, LiveAgentStatus>
  inProgressCount: number
}): number {
  let live = 0
  for (const status of opts.agentStatuses.values()) {
    if (status !== "gone") live++
  }
  return Math.min(opts.inProgressCount, live + opts.launchingIds.size)
}

export function TopBar(props: {
  width: number
  running: number
  boardName: string
  prefix: string
}) {
  const color = tuiColor()
  const theme = useTheme()
  const pieces = formatTopBar(props)
  const muted = color ? theme.muted : undefined
  const brandFg = color ? theme.focus : undefined
  return (
    <box height={1} width="100%" flexShrink={0}>
      <text>
        <span fg={brandFg}>
          <strong>{pieces.brand}</strong>
        </span>
        {pieces.showRunning ? <span fg={muted}>{pieces.running}</span> : null}
        <span>{"".padStart(pieces.leftPad, " ")}</span>
        <span fg={muted}>{pieces.center}</span>
        <span>{"".padStart(pieces.rightPad, " ")}</span>
        <span fg={muted}>{pieces.right}</span>
      </text>
    </box>
  )
}
