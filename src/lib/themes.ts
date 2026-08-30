import { fail } from "./errors.ts"

export const THEME_NAMES = ["nord", "catppuccin", "catppuccin_light", "light", "dracula"] as const
export type ThemeName = (typeof THEME_NAMES)[number]

export const DEFAULT_THEME: ThemeName = "nord"

export type ThemePalette = {
  fg: string
  muted: string
  border: string
  focus: string
  selectedBg: string
  cardBg: string
  bg: string
  overlayBg: string
  error: string
  backlog: string
  progress: string
  review: string
  done: string
}

export const THEMES: Record<ThemeName, ThemePalette> = {
  nord: {
    fg: "#eceff4",
    muted: "#7b88a1",
    border: "#4c566a",
    focus: "#88c0d0",
    selectedBg: "#434c5e",
    cardBg: "#3b4252",
    bg: "#2e3440",
    overlayBg: "#2e3440cc",
    error: "#bf616a",
    backlog: "#7b88a1",
    progress: "#ebcb8b",
    review: "#b48ead",
    done: "#a3be8c",
  },
  catppuccin: {
    fg: "#cdd6f4",
    muted: "#a6adc8",
    border: "#45475a",
    focus: "#89b4fa",
    selectedBg: "#45475a",
    cardBg: "#313244",
    bg: "#1e1e2e",
    overlayBg: "#1e1e2ecc",
    error: "#f38ba8",
    backlog: "#a6adc8",
    progress: "#f9e2af",
    review: "#cba6f7",
    done: "#a6e3a1",
  },
  catppuccin_light: {
    fg: "#4c4f69",
    muted: "#6c6f85",
    border: "#bcc0cc",
    focus: "#1e66f5",
    selectedBg: "#ccd0da",
    cardBg: "#e6e9ef",
    bg: "#eff1f5",
    overlayBg: "#eff1f5cc",
    error: "#d20f39",
    backlog: "#6c6f85",
    progress: "#df8e1d",
    review: "#8839ef",
    done: "#40a02b",
  },
  light: {
    fg: "#1f2328",
    muted: "#656d76",
    border: "#d0d7de",
    focus: "#0969da",
    selectedBg: "#ddf4ff",
    cardBg: "#f6f8fa",
    bg: "#ffffff",
    overlayBg: "#ffffffcc",
    error: "#cf222e",
    backlog: "#656d76",
    progress: "#9a6700",
    review: "#8250df",
    done: "#1a7f37",
  },
  dracula: {
    fg: "#f8f8f2",
    muted: "#6272a4",
    border: "#44475a",
    focus: "#bd93f9",
    selectedBg: "#44475a",
    cardBg: "#21222c",
    bg: "#282a36",
    overlayBg: "#282a36cc",
    error: "#ff5555",
    backlog: "#6272a4",
    progress: "#f1fa8c",
    review: "#bd93f9",
    done: "#50fa7b",
  },
}

const THEME_ALIASES: Record<string, ThemeName> = {
  nord: "nord",
  catppuccin: "catppuccin",
  "catppuccin-dark": "catppuccin",
  catppuccin_dark: "catppuccin",
  cattpuccin: "catppuccin",
  mocha: "catppuccin",
  catppuccin_light: "catppuccin_light",
  "catppuccin-light": "catppuccin_light",
  cattpuccin_light: "catppuccin_light",
  latte: "catppuccin_light",
  light: "light",
  dracula: "dracula",
}

export function isThemeName(value: string): value is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(value)
}

export function parseThemeName(raw: unknown): ThemeName {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_THEME
  if (typeof raw !== "string") {
    fail(`Invalid theme '${String(raw)}'. Known: ${THEME_NAMES.join(", ")}.`)
  }
  const key = raw.trim().toLowerCase().replace(/[\s]+/g, "_")
  const mapped = THEME_ALIASES[key]
  if (!mapped) {
    fail(`Unknown theme '${raw}'. Known: ${THEME_NAMES.join(", ")}.`)
  }
  return mapped
}

export function resolvePalette(name: ThemeName): ThemePalette {
  return THEMES[name] ?? THEMES[DEFAULT_THEME]
}
