import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import type { Task } from "../../lib/types.ts"
import { Card } from "./card.tsx"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

const task: Task = {
  id: "dev-14",
  title: "Show Herdr agent status",
  status: "in_progress",
  agent: "pi",
  project: "/Users/matheusbbarni/projects/herdr-tasks",
  created: "",
  updated: "",
  herdr: { workspace_id: "wP", pane_id: "wP:pV", agent_name: null },
  body: "",
  filePath: "",
}

async function renderCard(
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

test("in_progress card shows the status word at 80-col column width", async () => {
  const frame = await renderCard(
    <Card
      task={task}
      width={26}
      focused
      selected={false}
      launching={false}
      agentStatus="working"
      onMouseDown={() => {}}
    />,
    { width: 26, height: 6 },
  )
  expect(frame).toContain("working")
  expect(frame).toContain("pi")
  expect(frame).toContain("dev-14")
})

test("in_progress card meta fits the 60-col floor without wrapping", async () => {
  const frame = await renderCard(
    <Card
      task={task}
      width={60}
      focused={false}
      selected={false}
      launching={false}
      agentStatus="blocked"
      onMouseDown={() => {}}
    />,
    { width: 60, height: 6 },
  )
  expect(frame).toContain("blocked  pi  herdr-tasks")
  expect(frame).toContain("dev-14")
})

test("launching card keeps starting… instead of live status", async () => {
  const frame = await renderCard(
    <Card
      task={task}
      width={26}
      focused
      selected={false}
      launching
      agentStatus="idle"
      onMouseDown={() => {}}
    />,
    { width: 26, height: 6 },
  )
  expect(frame).toContain("starting…")
  expect(frame).not.toContain("idle")
})
