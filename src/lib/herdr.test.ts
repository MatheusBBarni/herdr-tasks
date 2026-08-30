import { expect, test } from "bun:test"
import {
  agentOnPane,
  closeTaskLayout,
  firstPrompt,
  reviewPrompt,
  focusTaskLayout,
  hasHerdrLayout,
  herdrCloseArgs,
  herdrCreateArgs,
  herdrFocusArgs,
  parseWorktreeCreate,
  parseWorktreeList,
  worktreeCreateArgs,
  joinPaneStatuses,
  listAgentStatuses,
  parseAgentStatus,
  parseCreatedLayout,
  parsePaneInfo,
  parseWorkspaceCreate,
  type HerdrRunner,
} from "./herdr.ts"
import type { Task } from "./types.ts"

const sample: Task = {
  id: "dev-1",
  title: "X",
  status: "in_progress",
  type: "feat",
  agent: "claude",
  effort: "",
  project: "/repo",
  created: "",
  updated: "",
  herdr: { workspace_id: null, pane_id: null, agent_name: null },
  blockers: [],
  worktree: false,
  body: "",
  filePath: "/repo/.herdr-tasks/tasks/dev-1.md",
}

test("parse workspace create JSON", () => {
  const parsed = parseWorkspaceCreate({
    result: {
      workspace: { workspace_id: "w1" },
      root_pane: { pane_id: "w1:p1" },
    },
  })
  expect(parsed).toEqual({ workspace_id: "w1", pane_id: "w1:p1" })
})

test("parse tab create and pane split JSON", () => {
  expect(
    parseCreatedLayout(
      {
        result: {
          tab: { tab_id: "w1:t2", workspace_id: "w1" },
          root_pane: { pane_id: "w1:p2" },
        },
      },
      "tab",
    ),
  ).toEqual({ workspace_id: "w1", pane_id: "w1:p2" })
  expect(
    parseCreatedLayout({ result: { pane: { pane_id: "w9:p3" } } }, "pane"),
  ).toEqual({ workspace_id: "w9", pane_id: "w9:p3" })
})

test("worktreeCreateArgs uses type/id branch and never mixes --workspace with --cwd", () => {
  expect(worktreeCreateArgs({ id: "dev-11", type: "feat", project: "/repo" })).toEqual([
    "worktree",
    "create",
    "--cwd",
    "/repo",
    "--branch",
    "feat/dev-11",
    "--label",
    "dev-11",
    "--no-focus",
  ])
  expect(worktreeCreateArgs({ id: "dev-11", type: "feat", project: "/repo" })).not.toContain(
    "--workspace",
  )
})

test("parseWorktreeList and parseWorktreeCreate read herdr JSON", () => {
  expect(
    parseWorktreeList({
      result: {
        worktrees: [
          { branch: "feat/dev-11", path: "/tmp/wt", open_workspace_id: "w9" },
          { branch: "main", path: "/repo" },
        ],
      },
    }),
  ).toEqual([
    { branch: "feat/dev-11", path: "/tmp/wt", open_workspace_id: "w9" },
    { branch: "main", path: "/repo" },
  ])
  expect(
    parseWorktreeCreate({
      result: {
        worktree: { path: "/tmp/wt", branch: "feat/dev-11" },
        workspace: { workspace_id: "wWT" },
        root_pane: { pane_id: "wWT:p1" },
      },
    }),
  ).toEqual({ path: "/tmp/wt", workspace_id: "wWT", pane_id: "wWT:p1" })
})

test("herdrCreateArgs follows herdr_behavior", () => {
  const task = { id: "dev-1", project: "/repo" }
  expect(herdrCreateArgs("workspace", task)).toEqual([
    "workspace",
    "create",
    "--cwd",
    "/repo",
    "--label",
    "dev-1",
    "--no-focus",
  ])
  expect(herdrCreateArgs("tab", task, { HERDR_WORKSPACE_ID: "wP" })).toEqual([
    "tab",
    "create",
    "--cwd",
    "/repo",
    "--label",
    "dev-1",
    "--no-focus",
    "--workspace",
    "wP",
  ])
  expect(herdrCreateArgs("pane", task, { HERDR_PANE_ID: "wP:p1" })).toEqual([
    "pane",
    "split",
    "--cwd",
    "/repo",
    "--no-focus",
    "--pane",
    "wP:p1",
  ])
  expect(herdrCreateArgs("pane", task, { HERDR_ENV: "1" })).toEqual([
    "pane",
    "split",
    "--cwd",
    "/repo",
    "--no-focus",
    "--current",
  ])
})

test("agentOnPane matches pane_id from agent list", () => {
  const payload = {
    result: {
      agents: [{ pane_id: "wP:pD", agent: "grok" }],
    },
  }
  expect(agentOnPane(payload, "wP:pD")).toBe(true)
  expect(agentOnPane(payload, "wP:p1")).toBe(false)
})

test("first prompt names htasks and herdr", () => {
  const text = firstPrompt(sample, "/repo/.herdr-tasks/skills/htasks/SKILL.md")
  expect(text).toContain("htasks move dev-1 review")
  expect(text).toContain("Read /repo/.herdr-tasks/tasks/dev-1.md")
  expect(text).toContain("this workspace")
  expect(firstPrompt(sample, "/tmp/SKILL.md", "tab")).toContain("this tab")
  expect(firstPrompt(sample, "/tmp/SKILL.md", "pane")).toContain("this pane")
})

test("review prompt is the skill name then the prompt file", () => {
  expect(
    reviewPrompt({
      skill: "thermo-nuclear-code-quality-review",
      prompt: "Check the diff for regressions.",
    }),
  ).toBe("thermo-nuclear-code-quality-review\nCheck the diff for regressions.")
  expect(reviewPrompt({ prompt: "Only the file." })).toBe("Only the file.")
  expect(reviewPrompt({ skill: "review" })).toBe("review")
  expect(reviewPrompt({})).toBe("")
})

test("parsePaneInfo reads pane get JSON", () => {
  expect(
    parsePaneInfo({
      result: {
        pane: {
          pane_id: "wP:pK",
          tab_id: "wP:tJ",
          workspace_id: "wP",
        },
      },
    }),
  ).toEqual({ pane_id: "wP:pK", tab_id: "wP:tJ", workspace_id: "wP" })
})

test("herdrFocusArgs follows herdr_behavior", () => {
  const ids = { workspace_id: "w1", pane_id: "w1:p1", tab_id: "w1:t2" }
  expect(herdrFocusArgs("workspace", ids)).toEqual(["workspace", "focus", "w1"])
  expect(herdrFocusArgs("tab", ids)).toEqual(["tab", "focus", "w1:t2"])
  expect(herdrFocusArgs("pane", ids)).toEqual(["agent", "focus", "w1:p1"])
})

function focusRunner(handler: (args: string[]) => { code: number; stdout: string; stderr: string }): {
  runner: HerdrRunner
  calls: string[][]
} {
  const calls: string[][] = []
  const runner: HerdrRunner = async (_bin, args) => {
    calls.push(args)
    if (args[0] === "--version") return { code: 0, stdout: "0.8.2", stderr: "" }
    return handler(args)
  }
  return { runner, calls }
}

const inProgress: Task = {
  ...sample,
  herdr: { workspace_id: "w1", pane_id: "w1:p1", agent_name: null },
}

test("focusTaskLayout focuses workspace, tab, or pane", async () => {
  const ok = { code: 0, stdout: "{}", stderr: "" }
  const workspace = focusRunner(() => ok)
  expect(await focusTaskLayout({ bin: "herdr", task: inProgress, behavior: "workspace", runner: workspace.runner })).toEqual({
    noun: "workspace",
    id: "w1",
  })
  expect(workspace.calls).toEqual([["--version"], ["workspace", "focus", "w1"]])

  const tab = focusRunner((args) => {
    if (args[0] === "pane" && args[1] === "get") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: { pane: { pane_id: "w1:p1", tab_id: "w1:t2", workspace_id: "w1" } },
        }),
        stderr: "",
      }
    }
    return ok
  })
  expect(await focusTaskLayout({ bin: "herdr", task: inProgress, behavior: "tab", runner: tab.runner })).toEqual({
    noun: "tab",
    id: "w1:t2",
  })
  expect(tab.calls).toEqual([
    ["--version"],
    ["pane", "get", "w1:p1"],
    ["tab", "focus", "w1:t2"],
  ])

  const pane = focusRunner(() => ok)
  expect(await focusTaskLayout({ bin: "herdr", task: inProgress, behavior: "pane", runner: pane.runner })).toEqual({
    noun: "pane",
    id: "w1:p1",
  })
  expect(pane.calls).toEqual([["--version"], ["agent", "focus", "w1:p1"]])
})

test("focusTaskLayout rejects backlog and missing layout", async () => {
  const { runner } = focusRunner(() => ({ code: 0, stdout: "{}", stderr: "" }))
  await expect(
    focusTaskLayout({
      bin: "herdr",
      task: { ...sample, status: "backlog" },
      runner,
    }),
  ).rejects.toThrow("is not in progress or review")
  await expect(
    focusTaskLayout({
      bin: "herdr",
      task: sample,
      runner,
    }),
  ).rejects.toThrow("has no Herdr workspace yet")
})

test("herdrCloseArgs follows herdr_behavior", () => {
  const ids = { workspace_id: "w1", pane_id: "w1:p1", tab_id: "w1:t2" }
  expect(herdrCloseArgs("workspace", ids)).toEqual(["workspace", "close", "w1"])
  expect(herdrCloseArgs("tab", ids)).toEqual(["tab", "close", "w1:t2"])
  expect(herdrCloseArgs("pane", ids)).toEqual(["pane", "close", "w1:p1"])
})

const done: Task = {
  ...sample,
  status: "done",
  herdr: { workspace_id: "w1", pane_id: "w1:p1", agent_name: null },
}

test("hasHerdrLayout is true when workspace or pane is set", () => {
  expect(hasHerdrLayout(sample)).toBe(false)
  expect(hasHerdrLayout(done)).toBe(true)
  expect(hasHerdrLayout({ ...sample, herdr: { workspace_id: "w1", pane_id: null, agent_name: null } })).toBe(true)
})

test("closeTaskLayout closes workspace, tab, or pane", async () => {
  const ok = { code: 0, stdout: "{}", stderr: "" }
  const workspace = focusRunner(() => ok)
  expect(
    await closeTaskLayout({
      bin: "herdr",
      task: done,
      behavior: "workspace",
      runner: workspace.runner,
      env: {},
    }),
  ).toEqual({ noun: "workspace", id: "w1" })
  expect(workspace.calls).toEqual([["--version"], ["workspace", "close", "w1"]])

  const tab = focusRunner((args) => {
    if (args[0] === "pane" && args[1] === "get") {
      return {
        code: 0,
        stdout: JSON.stringify({
          result: { pane: { pane_id: "w1:p1", tab_id: "w1:t2", workspace_id: "w1" } },
        }),
        stderr: "",
      }
    }
    return ok
  })
  expect(
    await closeTaskLayout({
      bin: "herdr",
      task: done,
      behavior: "tab",
      runner: tab.runner,
      env: {},
    }),
  ).toEqual({ noun: "tab", id: "w1:t2" })
  expect(tab.calls).toEqual([
    ["--version"],
    ["pane", "get", "w1:p1"],
    ["tab", "close", "w1:t2"],
  ])

  const pane = focusRunner(() => ok)
  expect(
    await closeTaskLayout({
      bin: "herdr",
      task: done,
      behavior: "pane",
      runner: pane.runner,
      env: {},
    }),
  ).toEqual({ noun: "pane", id: "w1:p1" })
  expect(pane.calls).toEqual([["--version"], ["pane", "close", "w1:p1"]])
})

test("closeTaskLayout rejects non-done and missing layout", async () => {
  const { runner } = focusRunner(() => ({ code: 0, stdout: "{}", stderr: "" }))
  await expect(
    closeTaskLayout({
      bin: "herdr",
      task: inProgress,
      runner,
      env: {},
    }),
  ).rejects.toThrow("is not done")
  await expect(
    closeTaskLayout({
      bin: "herdr",
      task: { ...sample, status: "done" },
      runner,
      env: {},
    }),
  ).rejects.toThrow("has no Herdr workspace to close")
})

test("closeTaskLayout treats already-gone layout as success", async () => {
  const missing = focusRunner(() => ({
    code: 1,
    stdout: JSON.stringify({
      error: { code: "workspace_not_found", message: "workspace w1 not found" },
    }),
    stderr: "",
  }))
  expect(
    await closeTaskLayout({
      bin: "herdr",
      task: done,
      behavior: "workspace",
      runner: missing.runner,
      env: {},
    }),
  ).toEqual({ noun: "workspace", id: "w1", alreadyGone: true })
})

const agentListFixture = await Bun.file(
  new URL("./fixtures/agent-list.json", import.meta.url),
).json()

test("parseAgentStatus indexes fixture agent-list JSON by pane_id", () => {
  const byPane = parseAgentStatus(agentListFixture)
  expect(byPane.get("wP:pV")).toBe("working")
  expect(byPane.get("wP:p1")).toBe("idle")
  expect(byPane.get("wR:p1")).toBe("blocked")
  expect(byPane.get("wS:p1")).toBe("done")
  expect(byPane.get("wT:p1")).toBe("unknown")
  expect(byPane.get("wU:p1")).toBe("unknown")
  expect(byPane.get("wV:p1")).toBe("unknown")
  expect(byPane.has("wMissing:p1")).toBe(false)
})

test("parseAgentStatus is empty on garbage and accepts root.agents", () => {
  expect(parseAgentStatus(null).size).toBe(0)
  expect(parseAgentStatus("nope").size).toBe(0)
  expect(parseAgentStatus({ agents: [{ pane_id: "w1:p1", agent_status: "idle" }] }).get("w1:p1")).toBe(
    "idle",
  )
})

test("joinPaneStatuses maps missing panes and failed list to gone", () => {
  const listed = parseAgentStatus(agentListFixture)
  const joined = joinPaneStatuses(["wP:pV", "wMissing:p1", "wP:pV"], listed)
  expect([...joined.entries()]).toEqual([
    ["wP:pV", "working"],
    ["wMissing:p1", "gone"],
  ])
  expect([...joinPaneStatuses(["wP:pV"], null).entries()]).toEqual([["wP:pV", "gone"]])
})

test("listAgentStatuses calls agent list once and does not N× agent get", async () => {
  const calls: string[][] = []
  const runner: HerdrRunner = async (_bin, args) => {
    calls.push(args)
    return { code: 0, stdout: JSON.stringify(agentListFixture), stderr: "" }
  }
  const byPane = await listAgentStatuses("herdr", runner)
  expect(calls).toEqual([["agent", "list"]])
  expect(byPane.get("wP:pV")).toBe("working")
})

test("listAgentStatuses throws when agent list fails", async () => {
  const runner: HerdrRunner = async () => ({
    code: 1,
    stdout: "",
    stderr: "herdr: agent list failed",
  })
  await expect(listAgentStatuses("herdr", runner)).rejects.toThrow("agent list failed")
})

test("closeTaskLayout refuses to close the caller's layout", async () => {
  const { runner, calls } = focusRunner(() => ({ code: 0, stdout: "{}", stderr: "" }))
  await expect(
    closeTaskLayout({
      bin: "herdr",
      task: done,
      behavior: "workspace",
      runner,
      env: { HERDR_WORKSPACE_ID: "w1" },
    }),
  ).rejects.toThrow("Refusing to close the current workspace")
  expect(calls).toEqual([["--version"]])
})
