import { useEffect, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { layoutNoun } from "../../lib/herdr.ts"
import type { HerdrBehavior, Task } from "../../lib/types.ts"
import { tuiColor, useTheme } from "../theme.ts"

type OverlayProps = {
  onClose: () => void
}

function useArmedEscape(onClose: () => void) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 60)
    return () => clearTimeout(t)
  }, [])
  useKeyboard((key) => {
    if (!armed) return
    if (key.name === "escape") {
      key.preventDefault?.()
      onClose()
    }
  })
}

export function HelpOverlay(props: OverlayProps & { behavior: HerdrBehavior }) {
  const color = tuiColor()
  const theme = useTheme()
  const noun = layoutNoun(props.behavior)
  useArmedEscape(props.onClose)
  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      border
      borderColor={color ? theme.focus : undefined}
      title="Help"
      padding={1}
    >
      <text>j/k or arrows   move focus</text>
      <text>h/l or arrows   change column (or move selected)</text>
      <text>space           select card</text>
      <text>esc             clear selection / close</text>
      <text>n               new task</text>
      <text>{`c               close herdr ${noun} (done)`}</text>
      <text>e               edit</text>
      <text>s               settings</text>
      <text>form            tab next  ^enter save  esc cancel</text>
      <text>enter           preview</text>
      <text>{`o               focus herdr ${noun} (in progress)`}</text>
      <text>?               help</text>
      <text>q / Ctrl+C      quit</text>
      <text>click           focus card</text>
      <text>drag            move to another column</text>
      <text> </text>
      <text fg={color ? theme.muted : undefined}>
        Drag uses mouse down/up + lane hit-testing. OpenTUI has no native drag-and-drop API.
      </text>
      <text fg={color ? theme.muted : undefined}>Esc to close</text>
    </box>
  )
}

export function PreviewOverlay(props: OverlayProps & { task: Task }) {
  const color = tuiColor()
  const theme = useTheme()
  useArmedEscape(props.onClose)
  const { task } = props
  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      border
      borderColor={color ? theme.focus : undefined}
      title={`${task.id} preview`}
      padding={1}
    >
      <box flexDirection="column" flexShrink={0}>
        <text>{task.title}</text>
        <text fg={color ? theme.muted : undefined}>{`status   ${task.status}`}</text>
        <text fg={color ? theme.muted : undefined}>{`agent    ${task.agent}`}</text>
        <text fg={color ? theme.muted : undefined}>{`project  ${task.project}`}</text>
        <text fg={color ? theme.muted : undefined}>{task.filePath}</text>
        <text> </text>
      </box>
      <scrollbox flexGrow={1} flexShrink={1} width="100%">
        <text>{task.body || "(no description)"}</text>
      </scrollbox>
      <text fg={color ? theme.muted : undefined}>Esc to close</text>
    </box>
  )
}

export function TooSmall(props: { width: number; height: number }) {
  const color = tuiColor()
  const theme = useTheme()
  return (
    <box width="100%" height="100%" justifyContent="center" alignItems="center">
      <text fg={color ? theme.error : undefined}>
        {`terminal too small (${props.width}x${props.height}). Need 40x10.`}
      </text>
    </box>
  )
}
