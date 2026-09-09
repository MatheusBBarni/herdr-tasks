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
      paths={pathsFor(join(tmpdir(), `htasks-keys-${Date.now()}`))}
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

test("c on a backlog card does not open the create form", async () => {
  const setup = await mountBoard([
    task({ id: "dev-1", status: "backlog", title: "Stay", order: 0 }),
  ])
  expect(setup.captureCharFrame()).toContain("dev-1")
  expect(setup.captureCharFrame()).not.toContain("New task")

  await press("c")

  const afterC = setup.captureCharFrame()
  expect(afterC).toContain("dev-1")
  expect(afterC).toContain("BACKLOG")
  expect(afterC).not.toContain("New task")
})

test("n opens the create form", async () => {
  const setup = await mountBoard([
    task({ id: "dev-1", status: "backlog", title: "Stay", order: 0 }),
  ])

  await press("n")

  expect(setup.captureCharFrame()).toContain("New task")
})
