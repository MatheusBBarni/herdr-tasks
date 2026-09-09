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

test("j/k still move among matches while the lane filter is open", async () => {
  const setup = await mountBoard([
    task({ id: "dev-1", status: "backlog", title: "Alpha first", order: 0 }),
    task({ id: "dev-2", status: "backlog", title: "Alpha second", order: 1 }),
    task({ id: "dev-3", status: "backlog", title: "Other task", order: 2 }),
  ])

  await press("f")
  await act(async () => {
    await Bun.sleep(80)
  })
  await setup.renderOnce()

  await act(async () => {
    await setup.mockInput.typeText("Alpha")
  })
  await setup.renderOnce()

  let frame = setup.captureCharFrame()
  expect(frame).toContain("Alpha")
  expect(frame).toContain("dev-1")
  expect(frame).toContain("dev-2")
  expect(frame).not.toContain("Other task")

  await press("j")
  frame = setup.captureCharFrame()
  expect(frame).not.toContain("Alphaj")

  await pressEnter()
  await pressEnter()
  frame = setup.captureCharFrame()
  expect(frame).toContain("dev-2 preview")
  expect(frame).not.toContain("dev-1 preview")
})
