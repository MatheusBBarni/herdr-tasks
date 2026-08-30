import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import type { Task } from "../../lib/types.ts"
import { Column } from "./column.tsx"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

function task(id: string, title: string): Task {
  return {
    id,
    title,
    status: "backlog",
    type: "feat",
    agent: "pi",
    effort: "",
    project: "/Users/matheusbbarni/projects/herdr-tasks",
    created: "",
    updated: "",
    herdr: { workspace_id: null, pane_id: null, agent_name: null },
    blockers: [],
    worktree: false,
    body: "",
    filePath: "",
    order: 0,
  }
}

const tasks: Task[] = [
  task("dev-1", "FIRST-CARD"),
  ...Array.from({ length: 10 }, (_, i) => task(`dev-${i + 2}`, `Mid ${i + 2}`)),
  task("dev-12", "LAST-CARD"),
]

async function renderColumn(focusedId: string) {
  testSetup = await testRender(
    <box width={40} height={10}>
      <Column
        lane="backlog"
        tasks={tasks}
        width={40}
        focused
        focusedId={focusedId}
        selectedId={null}
        launchingIds={new Set()}
        agentStatuses={new Map()}
        defaultProject="/Users/matheusbbarni/projects/herdr-tasks"
        onFocusTask={() => {}}
        onDrop={() => {}}
      />
    </box>,
    { width: 40, height: 10 },
  )
  await testSetup.renderOnce()
  await act(async () => {
    await Bun.sleep(50)
  })
  await testSetup.renderOnce()
  return testSetup.captureCharFrame()
}

test("lane shows the top card when it is focused", async () => {
  const frame = await renderColumn("dev-1")
  expect(frame).toContain("FIRST-CARD")
  expect(frame).not.toContain("LAST-CARD")
})

test("lane scrolls so a focused card below the fold is visible", async () => {
  const frame = await renderColumn("dev-12")
  expect(frame).toContain("LAST-CARD")
  expect(frame).not.toContain("FIRST-CARD")
})

test("empty lane has a heading and no empty placeholder", async () => {
  testSetup = await testRender(
    <box width={40} height={10}>
      <Column
        lane="backlog"
        tasks={[]}
        width={40}
        focused
        focusedId={null}
        selectedId={null}
        launchingIds={new Set()}
        agentStatuses={new Map()}
        defaultProject="/Users/matheusbbarni/projects/herdr-tasks"
        onFocusTask={() => {}}
        onDrop={() => {}}
      />
    </box>,
    { width: 40, height: 10 },
  )
  await testSetup.renderOnce()
  await act(async () => {
    await Bun.sleep(40)
  })
  await testSetup.renderOnce()
  const frame = testSetup.captureCharFrame()
  expect(frame).toContain("BACKLOG · 0")
  expect(frame).not.toContain("empty")
})
