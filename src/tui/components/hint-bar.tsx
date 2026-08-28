import { theme, tuiColor } from "../theme.ts"
import type { Hint } from "../hints.ts"

export function HintBar(props: { items: readonly Hint[] }) {
  const color = tuiColor()
  const muted = color ? theme.muted : undefined
  const keyFg = color ? theme.focus : undefined
  return (
    <box height={1} width="100%" flexShrink={0}>
      <text>
        {props.items.flatMap((hint, i) => [
          i > 0 ? (
            <span key={`gap-${hint.action}`} fg={muted}>
              {"  "}
            </span>
          ) : null,
          <span key={`action-${hint.action}`} fg={muted}>
            {`${hint.action}: `}
          </span>,
          <span key={`key-${hint.action}`} fg={keyFg}>
            <strong>{hint.key}</strong>
          </span>,
        ])}
      </text>
    </box>
  )
}
