import { createContext, createElement, useContext, type ReactNode } from "react"
import { colorEnabled } from "../lib/color.ts"
import {
  DEFAULT_THEME,
  THEMES,
  type ThemeName,
  type ThemePalette,
} from "../lib/themes.ts"
import type { Lane } from "../lib/types.ts"

export function tuiColor(): boolean {
  return colorEnabled(process.stdout)
}

const ThemeContext = createContext<ThemePalette>(THEMES[DEFAULT_THEME])

export function ThemeProvider(props: { name: ThemeName; children: ReactNode }) {
  const palette = THEMES[props.name] ?? THEMES[DEFAULT_THEME]
  return createElement(ThemeContext.Provider, { value: palette }, props.children)
}

export function useTheme(): ThemePalette {
  return useContext(ThemeContext)
}

export const VERTICAL_SCROLLBAR_WIDTH = 1

export function verticalScrollbarOptions(theme: ThemePalette, color: boolean) {
  return {
    width: VERTICAL_SCROLLBAR_WIDTH,
    flexShrink: 0,
    ...(color
      ? {
          trackOptions: {
            foregroundColor: theme.muted,
            backgroundColor: theme.cardBg,
          },
        }
      : {}),
  }
}

export function laneColor(lane: Lane, colors: ThemePalette = THEMES[DEFAULT_THEME]): string {
  if (lane === "in_progress") return colors.progress
  if (lane === "review") return colors.review
  if (lane === "done") return colors.done
  return colors.backlog
}
