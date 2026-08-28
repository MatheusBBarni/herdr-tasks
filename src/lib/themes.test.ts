import { expect, test } from "bun:test"
import { DEFAULT_THEME, THEME_NAMES, THEMES, parseThemeName } from "./themes.ts"

test("every shipped theme has a full palette", () => {
  for (const name of THEME_NAMES) {
    const palette = THEMES[name]
    expect(palette.bg.startsWith("#")).toBe(true)
    expect(palette.fg.startsWith("#")).toBe(true)
    expect(palette.focus.startsWith("#")).toBe(true)
    expect(palette.overlayBg.startsWith("#")).toBe(true)
  }
})

test("parseThemeName defaults and aliases", () => {
  expect(parseThemeName(undefined)).toBe(DEFAULT_THEME)
  expect(parseThemeName("")).toBe("nord")
  expect(parseThemeName("Dracula")).toBe("dracula")
  expect(parseThemeName("catppuccin-light")).toBe("catppuccin_light")
  expect(parseThemeName("cattpuccin")).toBe("catppuccin")
  expect(parseThemeName("latte")).toBe("catppuccin_light")
  expect(parseThemeName("mocha")).toBe("catppuccin")
})

test("parseThemeName rejects unknown names", () => {
  expect(() => parseThemeName("solarized")).toThrow(/Unknown theme/)
})
