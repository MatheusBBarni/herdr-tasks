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

async function renderBoard(
  width: number,
  singlePane: boolean,
  extra?: {
    lanes?: string[]
    focusedLane?: string
    focusedId?: string | null
  },
) {
  testSetup = await testRender(
    <Board
      tasks={tasks}
      width={width}
      boardName="herdr-tasks"
      prefix="dev"
      defaultProject={project}
      singlePane={singlePane}
      focusedLane={extra?.focusedLane ?? "in_progress"}
      focusedId={extra?.focusedId === undefined ? "dev-14" : extra.focusedId}
      selectedId={null}
      launchingIds={new Set()}
      agentStatuses={statuses}
      onFocusTask={() => {}}
      onDrop={() => {}}
      toast={null}
      lanes={extra?.lanes}
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

test("board filter input is above the lane and hides non-matching cards", async () => {
  testSetup = await testRender(
    <Board
      tasks={[
        ...tasks,
        task({ id: "dev-9", status: "backlog", title: "Unrelated" }),
      ]}
      width={80}
      boardName="herdr-tasks"
      prefix="dev"
      defaultProject={project}
      singlePane={false}
      focusedLane="backlog"
      focusedId="dev-1"
      selectedId={null}
      launchingIds={new Set()}
      agentStatuses={statuses}
      filterQueries={{ backlog: "Later" }}
      onFocusTask={() => {}}
      onDrop={() => {}}
      toast={null}
    />,
    { width: 80, height: 24 },
  )
  await testSetup.renderOnce()
  await act(async () => {
    await Bun.sleep(80)
  })
  await testSetup.renderOnce()
  const frame = testSetup.captureCharFrame()
  expect(frame).toContain("BACKLOG · 1/2")
  expect(frame).toContain("Later")
  expect(frame).not.toContain("Unrelated")
  expect(frame).toContain("dev-14")
})

const extraLanes = ["backlog", "in_progress", "pr", "review", "address", "done"]

test("board keeps full lane headings when there are more than four columns", async () => {
  const frame = await renderBoard(80, false, { lanes: extraLanes })
  expect(frame).toContain("IN PROGRESS")
  expect(frame).toContain("BACKLOG")
  expect(frame).toContain("REVIEW")
  expect(frame).not.toContain("ADDRESS")
  expect(frame).not.toContain("DONE")
})

test("board grows six lanes across a wide terminal instead of wrapping", async () => {
  const frame = await renderBoard(160, false, { lanes: extraLanes })
  const heading = frame.split("\n").find((line) => line.includes("BACKLOG") && line.includes("DONE"))
  expect(heading).toBeDefined()
  expect(heading!.indexOf("DONE") - heading!.indexOf("BACKLOG")).toBeGreaterThan(110)
  expect(frame).toContain("IN PROGRESS")
  expect(frame).toContain("ADDRESS")
})

test("board scrolls a focused off-screen lane into view", async () => {
  const frame = await renderBoard(80, false, {
    lanes: extraLanes,
    focusedLane: "done",
    focusedId: "dev-2",
  })
  expect(frame).toContain("DONE")
  expect(frame).toContain("ADDRESS")
  expect(frame).not.toContain("BACKLOG")
  expect(frame).not.toContain("IN PROGRESS")
})

