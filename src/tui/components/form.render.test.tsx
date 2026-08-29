import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { TaskForm } from "./form.tsx"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

async function mountForm(
  node: Parameters<typeof testRender>[0],
  size: { width: number; height: number },
) {
  testSetup = await testRender(node, size)
  await testSetup.renderOnce()
  await act(async () => {
    await Bun.sleep(80)
  })
  await testSetup.renderOnce()
  return testSetup
}

async function renderForm(
  node: Parameters<typeof testRender>[0],
  size: { width: number; height: number },
) {
  const setup = await mountForm(node, size)
  return setup.captureCharFrame()
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

test("create form is a compact centered card at 80x24", async () => {
  const frame = await renderForm(
    <TaskForm
      mode="create"
      initial={{
        title: "Improve the UI of the create task form",
        description: "",
        type: "feat",
        agent: "pi",
        effort: "",
        project: "/Users/me/herdr-tasks",
        blockers: [],
      }}
      typeKeys={["feat", "fix", "bug"]}
      agentKeys={["claude", "codex", "pi"]}
      blockerTasks={[{ id: "dev-1", title: "First" }]}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
    { width: 80, height: 24 },
  )
  expect(frame).toContain("New task")
  expect(frame).toContain("title")
  expect(frame).toContain("description")
  expect(frame).toContain("type")
  expect(frame).toContain("effort")
  expect(frame).toContain("agent")
  expect(frame).toContain("project")
  expect(frame).toContain("blockers")
  expect(frame).toContain("tab next")
  expect(frame).toContain("^enter save")
  expect(frame).toContain("esc cancel")
  expect(frame).not.toContain("Tab fields")
  expect(frame).not.toContain("newline in description")
  expect(frame).not.toContain("claude, codex")
  const lines = frame.replace(/\s+$/gm, "").split("\n")
  const typeLine = lines.findIndex((line) => /\btype\b/.test(line))
  const effortLine = lines.findIndex((line) => /\beffort\b/.test(line))
  const agentLine = lines.findIndex((line) => line.includes("agent"))
  const projectLine = lines.findIndex((line) => line.includes("project"))
  const blockerLine = lines.findIndex((line) => line.includes("blockers"))
  expect(typeLine).toBeGreaterThan(0)
  expect(effortLine).toBe(typeLine)
  expect(agentLine).toBe(typeLine)
  expect(projectLine).toBe(agentLine)
  expect(blockerLine).toBeGreaterThan(projectLine)
})

test("edit form titles the dialog with the task id", async () => {
  const frame = await renderForm(
    <TaskForm
      mode="edit"
      taskId="dev-3"
      initial={{
        title: "Improve the UI",
        description: "details",
        type: "feat",
        agent: "pi",
        effort: "high",
        project: "/tmp",
        blockers: ["dev-1"],
      }}
      typeKeys={["feat", "fix"]}
      agentKeys={["pi"]}
      blockerTasks={[{ id: "dev-1", title: "First" }]}
      error="Title is required."
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
    { width: 80, height: 24 },
  )
  expect(frame).toContain("Edit dev-3")
  expect(frame).toContain("Title is required.")
  expect(frame).toContain("blockers  dev-1")
})

test("type, agent, and project stack on a 60-column floor", async () => {
  const frame = await renderForm(
    <TaskForm
      mode="create"
      initial={{
        title: "Improve the UI",
        description: "",
        type: "feat",
        agent: "pi",
        effort: "",
        project: "/Users/me/herdr-tasks",
        blockers: [],
      }}
      typeKeys={["feat", "fix"]}
      agentKeys={["pi"]}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
    { width: 60, height: 24 },
  )
  const lines = frame.replace(/\s+$/gm, "").split("\n")
  const typeLine = lines.findIndex((line) => /\btype\b/.test(line))
  const effortLine = lines.findIndex((line) => /\beffort\b/.test(line))
  const agentLine = lines.findIndex((line) => /\bagent\b/.test(line))
  const projectLine = lines.findIndex((line) => /\bproject\b/.test(line))
  expect(typeLine).toBeGreaterThan(0)
  expect(effortLine).toBe(typeLine)
  expect(agentLine).toBeGreaterThan(typeLine)
  expect(projectLine).toBeGreaterThan(agentLine)
})

const formProps = {
  mode: "create" as const,
  initial: {
    title: "Improve the UI",
    description: "details",
    type: "feat",
    agent: "pi",
    effort: "",
    project: "/tmp",
    blockers: [] as string[],
  },
  typeKeys: ["feat", "fix", "bug"],
  agentKeys: ["pi"],
  error: null as string | null,
}

test("clicking save submits the form", async () => {
  const submitted: unknown[] = []
  const setup = await mountForm(
    <TaskForm
      {...formProps}
      onSubmit={(values) => {
        submitted.push(values)
      }}
      onCancel={() => {}}
    />,
    { width: 80, height: 24 },
  )
  await clickLabel(setup, "^enter save")
  expect(submitted).toEqual([
    {
      title: "Improve the UI",
      description: "details",
      type: "feat",
      agent: "pi",
      effort: "",
      project: "/tmp",
      blockers: [],
    },
  ])
})

test("clicking cancel closes the form", async () => {
  let cancelled = 0
  const setup = await mountForm(
    <TaskForm
      {...formProps}
      onSubmit={() => {}}
      onCancel={() => {
        cancelled += 1
      }}
    />,
    { width: 80, height: 24 },
  )
  await clickLabel(setup, "esc cancel")
  expect(cancelled).toBe(1)
})

test("clicking save with an empty title shows a field error", async () => {
  const submitted: unknown[] = []
  const setup = await mountForm(
    <TaskForm
      {...formProps}
      initial={{ ...formProps.initial, title: "" }}
      onSubmit={(values) => {
        submitted.push(values)
      }}
      onCancel={() => {}}
    />,
    { width: 80, height: 24 },
  )
  await clickLabel(setup, "^enter save")
  expect(submitted).toEqual([])
  expect(setup.captureCharFrame()).toContain("Title is required.")
})

test("project field is a select when projects are listed", async () => {
  const frame = await renderForm(
    <TaskForm
      mode="create"
      initial={{
        title: "Improve the UI",
        description: "",
        type: "feat",
        agent: "pi",
        effort: "",
        project: "/repo/htasks",
        blockers: [],
      }}
      typeKeys={["feat", "fix"]}
      agentKeys={["pi"]}
      projectOptions={[
        { key: "herdr-tasks", name: "herdr-tasks", path: "/repo/htasks" },
        { key: "other", name: "other", path: "/repo/other" },
      ]}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
    { width: 80, height: 24 },
  )
  expect(frame).toContain("project")
  expect(frame).toContain("herdr-tasks")
  expect(frame).not.toContain("/repo/htasks")
})

test("clicking next moves focus off the title field", async () => {
  const setup = await mountForm(
    <TaskForm {...formProps} onSubmit={() => {}} onCancel={() => {}} />,
    { width: 80, height: 24 },
  )
  const before = setup.captureCharFrame()
  expect(before.indexOf("╔")).toBeGreaterThan(before.indexOf("title"))
  expect(before.indexOf("╔")).toBeLessThan(before.indexOf("description"))
  await clickLabel(setup, "tab next")
  const after = setup.captureCharFrame()
  expect(after.indexOf("╔")).toBeGreaterThan(after.indexOf("description"))
})
