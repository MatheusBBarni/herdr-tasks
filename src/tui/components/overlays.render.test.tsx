import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import type { Task } from "../../lib/types.ts"
import { PreviewOverlay } from "./overlays.tsx"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

const task: Task = {
  id: "dev-21",
  title: "Image in task description",
  status: "backlog",
  order: 0,
  type: "feat",
  agent: "pi",
  effort: "",
  project: "/Users/me/herdr-tasks",
  created: "",
  updated: "",
  herdr: { workspace_id: null, pane_id: null, agent_name: null },
  blockers: [],
  worktree: false,
  body: "# Image in task description\n\nSee ![login](https://ex.com/a.png)",
  filePath: "/Users/me/herdr-tasks/.herdr-tasks/tasks/dev-21.md",
}

async function renderPreview(
  node: Parameters<typeof testRender>[0],
  size: { width: number; height: number },
) {
  testSetup = await testRender(node, size)
  await testSetup.renderOnce()
  await act(async () => {
    await Bun.sleep(40)
  })
  await testSetup.renderOnce()
  return testSetup.captureCharFrame()
}

test("preview shows an image as a URL link, not a preview", async () => {
  const frame = await renderPreview(
    <PreviewOverlay task={task} onClose={() => {}} />,
    { width: 80, height: 24 },
  )
  expect(frame).toContain("dev-21 preview")
  expect(frame).toContain("See")
  expect(frame).toContain("https://ex.com/a.png")
  expect(frame).toContain("login")
  expect(frame).not.toContain("![login]")
})
