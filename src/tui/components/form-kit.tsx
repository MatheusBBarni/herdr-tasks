import type { ReactNode } from "react"
import type { ThemePalette } from "../../lib/themes.ts"
import { useTheme } from "../theme.ts"

export type CompactSelectOption = {
  name: string
  description: string
  value: string
}

const SELECT_BINDINGS = [
  { name: "left", action: "move-up" as const },
  { name: "right", action: "move-down" as const },
]

function swallowMouse() {}

export function selectOptionValue(
  option: { value?: unknown; name?: unknown } | undefined | null,
): string {
  const value = option?.value ?? option?.name ?? ""
  return typeof value === "string" ? value : ""
}

export function noneSelectValue(value: string): string {
  return value === "none" ? "" : value
}

export function fieldInputColors(theme: ThemePalette, color: boolean) {
  if (!color) return {}
  return {
    backgroundColor: theme.bg,
    textColor: theme.fg,
    focusedBackgroundColor: theme.bg,
    placeholderColor: theme.muted,
    cursorColor: theme.focus,
  }
}

export function fieldSelectColors(theme: ThemePalette, color: boolean) {
  if (!color) return {}
  return {
    backgroundColor: theme.bg,
    textColor: theme.fg,
    focusedBackgroundColor: theme.bg,
    focusedTextColor: theme.fg,
    selectedBackgroundColor: theme.selectedBg,
    selectedTextColor: theme.fg,
  }
}

export function DialogOverlay(props: {
  title: string
  width: number
  color: boolean
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      flexDirection="row"
      justifyContent="center"
      alignItems="center"
      zIndex={20}
      backgroundColor={props.color ? theme.overlayBg : undefined}
      onMouseDown={swallowMouse}
      onMouseUp={swallowMouse}
    >
      <box
        width={props.width}
        flexDirection="column"
        flexShrink={0}
        border
        borderStyle="single"
        borderColor={props.color ? theme.border : undefined}
        title={props.title}
        titleColor={props.color ? theme.focus : undefined}
        padding={1}
        backgroundColor={props.color ? theme.cardBg : undefined}
      >
        {props.children}
      </box>
    </box>
  )
}

export function CompactSelect(props: {
  options: CompactSelectOption[]
  selectedIndex: number
  focused: boolean
  color: boolean
  onChange?: (index: number, value: string) => void
  onSelect?: (index: number, value: string) => void
}) {
  const theme = useTheme()
  return (
    <select
      options={props.options}
      selectedIndex={props.selectedIndex}
      focused={props.focused}
      width="100%"
      height={1}
      showDescription={false}
      showSelectionIndicator={false}
      wrapSelection
      keyBindings={SELECT_BINDINGS}
      {...fieldSelectColors(theme, props.color)}
      onChange={(index, option) => {
        props.onChange?.(index, selectOptionValue(option))
      }}
      onSelect={
        props.onSelect
          ? (index, option) => {
              props.onSelect?.(index, selectOptionValue(option))
            }
          : undefined
      }
    />
  )
}
