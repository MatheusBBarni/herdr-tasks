import { expect, test } from "bun:test"
import { classifySettingsError, settingsLayout } from "./settings.tsx"

test("settingsLayout is two columns at 80 and stacks below 70", () => {
  expect(settingsLayout(80)).toEqual({ dialogWidth: 72, stackFields: false })
  expect(settingsLayout(60).stackFields).toBe(true)
  expect(settingsLayout(60).dialogWidth).toBeLessThan(60)
})

test("classifySettingsError puts messages under the matching field", () => {
  expect(classifySettingsError("Unknown theme 'x'. Known: nord")).toEqual({
    theme: "Unknown theme 'x'. Known: nord",
  })
  expect(classifySettingsError("Unknown agent 'nope'. Known: pi")).toEqual({
    default_agent: "Unknown agent 'nope'. Known: pi",
  })
  expect(classifySettingsError("Invalid herdr.behavior 'window'. Use tab, workspace, or pane.")).toEqual({
    herdr_behavior: "Invalid herdr.behavior 'window'. Use tab, workspace, or pane.",
  })
  expect(classifySettingsError("Project path does not exist: /tmp/missing")).toEqual({
    default_project: "Project path does not exist: /tmp/missing",
  })
  expect(classifySettingsError("herdr_bin cannot be empty.")).toEqual({
    herdr_bin: "herdr_bin cannot be empty.",
  })
  expect(classifySettingsError("something else")).toEqual({ form: "something else" })
  expect(classifySettingsError(null)).toEqual({})
})
