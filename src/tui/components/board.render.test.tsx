import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import type { LiveAgentStatus } from "../../lib/herdr.ts"
import type { Task } from "../../lib/types.ts"
import { Board } from "./board.tsx"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

const project = "/Users/matheusbbarni/projects/herdr-tasks"

function task(partial: Partial<Task> & Pick<Task, "id" | "status" | "title">): Task {
  return {
    type: "feat",
    agent: "pi",
    effort: "",
    project,
    created: "",
    updated: "",
    herdr: { workspace_id: null, pane_id: null, agent_name: null },
    blockers: [],
    worktree: false,
    body: "",
    filePath: "",
    order: 0,
    ...partial,
  }
}

const tasks: Task[] = [
  task({ id: "dev-1", status: "backlog", title: "Later" }),
  task({
    id: "dev-14",
    status: "in_progress",
    title: "Show status",
    herdr: { workspace_id: "wP", pane_id: "wP:pV", agent_name: null },
  }),
  task({ id: "dev-2", status: "done", title: "Shipped" }),
]

const statuses = new Map<string, LiveAgentStatus>([["wP:pV", "working"]])

async function renderBoard(width: number, singlePane: boolean) {
  testSetup = await testRender(
    <Board
      tasks={tasks}
      width={width}
      boardName="herdr-tasks"
      prefix="dev"
      defaultProject={project}
      singlePane={singlePane}
      focusedLane="in_progress"
      focusedId="dev-14"
      selectedId={null}
      launchingIds={new Set()}
      agentStatuses={statuses}
      onFocusTask={() => {}}
      onDrop={() => {}}
      toast={null}
    />,
    { width, height: 24 },
  )
  await testSetup.renderOnce()
  await act(async () => {
    await Bun.sleep(40)
  })
  await testSetup.renderOnce()
  return testSetup.captureCharFrame()
}

test("board shows live status on in_progress cards at 80x24", async () => {
  const frame = await renderBoard(80, false)
  expect(frame).toContain("htasks")
  expect(frame).toContain("IN PROGRESS")
  expect(frame).toContain("REVIEW")
  expect(frame).toContain("dev-14")
  expect(frame).toContain("working")
  expect(frame).toContain("pi")
  expect(frame).toContain("[ space select ]")
  expect(frame).not.toContain("empty")
})

test("board 60-col single pane still shows the status word", async () => {
  const frame = await renderBoard(60, true)
  expect(frame).toContain("working")
  expect(frame).toContain("pi")
  expect(frame).toContain("dev-14")
  expect(frame).not.toContain("Later")
  expect(frame).not.toContain("feat  working  pi  herdr-tasks")
})
