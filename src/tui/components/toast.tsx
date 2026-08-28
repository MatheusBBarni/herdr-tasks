import { tuiColor, useTheme } from "../theme.ts"

export type ToastKind = "ok" | "error"

export type ToastInfo = {
  message: string
  kind: ToastKind
}

export function ToastBar(props: { toast: ToastInfo }) {
  const color = tuiColor()
  const theme = useTheme()
  const fg = color ? (props.toast.kind === "error" ? theme.error : theme.done) : undefined
  return (
    <box height={1} width="100%" flexShrink={0}>
      <text fg={fg}>{props.toast.message}</text>
    </box>
  )
}
