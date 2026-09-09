import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { act } from "react"
import { pathsFor } from "../lib/root.ts"
import { EMPTY_HERDR, EMPTY_REVIEW, type Config, type Task } from "../lib/types.ts"
import { App } from "./app.tsx"

let testSetup: TestRendererSetup | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

const project = "/Users/matheusbbarni/projects/herdr-tasks"

function task(partial: Partial<Task> & Pick<Task, "id" | "status" | "title" | "order">): Task {
  return {
    type: "feat",
    agent: "claude",
    effort: "",
    project,
    created: "",
    updated: "",
    herdr: EMPTY_HERDR,
    blockers: [],
    worktree: false,
    body: "",
    filePath: "",
    ...partial,
  }
}

const config: Config = {
  prefix: "dev",
  default_agent: "claude",
  default_project: project,
  theme: "nord",
  lanes: ["backlog", "in_progress", "review", "done"],
  lane_defs: {},
  next_id: 4,
  herdr_bin: "herdr",
  herdr_behavior: "workspace",
  agents: { claude: { command: "ccc", kind: "claude" } },
  projects: {},
  task_types: ["feat", "fix"],
  default_type: "feat",
  review: { ...EMPTY_REVIEW },
}

async function mountBoard(tasks: Task[]) {
  testSetup = await testRender(
    <App
      paths={pathsFor(join(tmpdir(), `htasks-filter-${Date.now()}`))}
      cwd={project}
      initialConfig={config}
      initialTasks={tasks}
    />,
    { width: 80, height: 24 },
  )
  await testSetup.renderOnce()
  await act(async () => {
    await Bun.sleep(40)
  })
  await testSetup.renderOnce()
  return testSetup
}

async function press(key: string) {
  await act(async () => {
    testSetup!.mockInput.pressKey(key)
    await Bun.sleep(20)
  })
  await testSetup!.renderOnce()
}

async function pressEnter() {
  await act(async () => {
    testSetup!.mockInput.pressEnter()
    await Bun.sleep(20)
  })
  await testSetup!.renderOnce()
}

async function pressArrow(direction: "up" | "down") {
  await act(async () => {
    testSetup!.mockInput.pressArrow(direction)
    await Bun.sleep(20)
  })
  await testSetup!.renderOnce()
}

const alphaTasks = [
  task({ id: "dev-1", status: "backlog", title: "Alpha first", order: 0 }),
  task({ id: "dev-2", status: "backlog", title: "Alpha second", order: 1 }),
  task({ id: "dev-3", status: "backlog", title: "Other task", order: 2 }),
]

async function openAlphaFilter() {
  const setup = await mountBoard(alphaTasks)
  await press("f")
  await act(async () => {
    await Bun.sleep(80)
  })
  await setup.renderOnce()
  await act(async () => {
    await setup.mockInput.typeText("Alpha")
  })
  await setup.renderOnce()
  const frame = setup.captureCharFrame()
  expect(frame).toContain("Alpha")
  expect(frame).toContain("dev-1")
  expect(frame).toContain("dev-2")
  expect(frame).not.toContain("Other task")
  return setup
}

test("down arrow moves among matches while the lane filter is open", async () => {
  const setup = await openAlphaFilter()
  await pressArrow("down")
  await pressEnter()
  await pressEnter()
  const frame = setup.captureCharFrame()
  expect(frame).toContain("dev-2 preview")
  expect(frame).not.toContain("dev-1 preview")
})

test("up arrow moves among matches while the lane filter is open", async () => {
  const setup = await openAlphaFilter()
  await pressArrow("down")
  await pressArrow("up")
  await pressEnter()
  await pressEnter()
  const frame = setup.captureCharFrame()
  expect(frame).toContain("dev-1 preview")
  expect(frame).not.toContain("dev-2 preview")
})

test("j and k still type into the filter query", async () => {
  const setup = await openAlphaFilter()
  await press("j")
  await press("k")
  const frame = setup.captureCharFrame()
  expect(frame).toContain("Alphajk")
  expect(frame).toContain("no matches")
  expect(frame).not.toContain("dev-1 preview")
})
