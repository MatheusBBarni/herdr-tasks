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

const clickTasks = [
  task({ id: "dev-1", status: "backlog", title: "Alpha first", order: 0 }),
  task({ id: "dev-2", status: "backlog", title: "Alpha second", order: 1 }),
  task({ id: "dev-3", status: "backlog", title: "Alpha third", order: 2 }),
]

async function mountBoard(tasks: Task[]) {
  testSetup = await testRender(
    <App
      paths={pathsFor(join(tmpdir(), `htasks-click-${Date.now()}`))}
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
    testSetup!.mockInput.pressKey(key === "space" ? " " : key)
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

function findCell(frame: string, needle: string): { x: number; y: number } {
  const lines = frame.split("\n")
  for (let y = 0; y < lines.length; y++) {
    const x = lines[y]!.indexOf(needle)
    if (x >= 0) return { x: x + Math.floor(needle.length / 2), y }
  }
  throw new Error(`not found: ${needle}\n${frame}`)
}

async function clickLabel(setup: NonNullable<typeof testSetup>, needle: string) {
  const { x, y } = findCell(setup.captureCharFrame(), needle)
  await act(async () => {
    await setup.mockMouse.click(x, y)
  })
  await setup.renderOnce()
}

test("clicking a card focuses it without selecting so j moves focus", async () => {
  const setup = await mountBoard(clickTasks)
  await clickLabel(setup, "dev-2")
  expect(setup.captureCharFrame()).not.toContain("j/k order")
  await press("j")
  await pressEnter()
  const frame = setup.captureCharFrame()
  expect(frame).toContain("dev-3 preview")
  expect(frame).not.toContain("dev-2 preview")
})

test("space still toggles select after a click", async () => {
  const setup = await mountBoard(clickTasks)
  await clickLabel(setup, "dev-2")
  await press("space")
  expect(setup.captureCharFrame()).toContain("j/k order")
  await press("space")
  expect(setup.captureCharFrame()).not.toContain("j/k order")
})

test("clicking after space deselects so j moves focus", async () => {
  const setup = await mountBoard(clickTasks)
  await press("space")
  expect(setup.captureCharFrame()).toContain("j/k order")
  await clickLabel(setup, "dev-2")
  expect(setup.captureCharFrame()).not.toContain("j/k order")
  await press("j")
  await pressEnter()
  const frame = setup.captureCharFrame()
  expect(frame).toContain("dev-3 preview")
  expect(frame).not.toContain("dev-2 preview")
})
