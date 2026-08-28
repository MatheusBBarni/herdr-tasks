import { expect, test } from "bun:test"
import { agentOnPane, firstPrompt, herdrCreateArgs, parseCreatedLayout, parseWorkspaceCreate } from "./herdr.ts"
import type { Task } from "./types.ts"

const sample: Task = {
  id: "dev-1",
  title: "X",
  status: "in_progress",
  agent: "claude",
  project: "/repo",
  created: "",
  updated: "",
  herdr: { workspace_id: null, pane_id: null, agent_name: null },
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
  expect(text).toContain("htasks move dev-1 done")
  expect(text).toContain("Read /repo/.herdr-tasks/tasks/dev-1.md")
  expect(text).toContain("this workspace")
  expect(firstPrompt(sample, "/tmp/SKILL.md", "tab")).toContain("this tab")
  expect(firstPrompt(sample, "/tmp/SKILL.md", "pane")).toContain("this pane")
})
