import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { SettingsForm } from "./settings.tsx"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

async function renderSettings(
  node: Parameters<typeof testRender>[0],
  size: { width: number; height: number },
) {
  testSetup = await testRender(node, size)
  await testSetup.renderOnce()
  await act(async () => {
    await Bun.sleep(80)
  })
  await testSetup.renderOnce()
  return testSetup.captureCharFrame()
}

const initial = {
  theme: "nord" as const,
  default_agent: "pi",
  default_project: "/Users/me/herdr-tasks",
  herdr_behavior: "workspace" as const,
  herdr_bin: "herdr",
}

test("settings dialog is a compact centered card at 80x24", async () => {
  const frame = await renderSettings(
    <SettingsForm
      initial={initial}
      agentKeys={["claude", "pi"]}
      error={null}
      onPreviewTheme={() => {}}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
    { width: 80, height: 24 },
  )
  expect(frame).toContain("Settings")
  expect(frame).toContain("theme")
  expect(frame).toContain("default agent")
  expect(frame).toContain("herdr behavior")
  expect(frame).toContain("herdr bin")
  expect(frame).toContain("default project")
  expect(frame).toContain("tab next")
  expect(frame).toContain("^enter save")
  expect(frame).toContain("esc cancel")
  const lines = frame.replace(/\s+$/gm, "").split("\n")
  const themeLine = lines.findIndex((line) => /\btheme\b/.test(line))
  const agentLine = lines.findIndex((line) => line.includes("default agent"))
  expect(themeLine).toBeGreaterThan(0)
  expect(agentLine).toBe(themeLine)
})

test("settings fields stack on a 60-column floor", async () => {
  const frame = await renderSettings(
    <SettingsForm
      initial={initial}
      agentKeys={["pi"]}
      error="herdr_bin cannot be empty."
      onPreviewTheme={() => {}}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
    { width: 60, height: 24 },
  )
  expect(frame).toContain("herdr_bin cannot be empty.")
  const lines = frame.replace(/\s+$/gm, "").split("\n")
  const themeLine = lines.findIndex((line) => /\btheme\b/.test(line))
  const agentLine = lines.findIndex((line) => line.includes("default agent"))
  expect(themeLine).toBeGreaterThan(0)
  expect(agentLine).toBeGreaterThan(themeLine)
})
