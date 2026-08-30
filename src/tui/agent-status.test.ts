import { expect, test } from "bun:test"
import type { Task } from "../lib/types.ts"
import { inProgressPaneIds } from "./agent-status.ts"

function task(partial: Partial<Task> & Pick<Task, "id" | "status">): Task {
  return {
    title: partial.id,
    type: "",
    agent: "pi",
    effort: "",
    project: "/repo",
    created: "",
    updated: "",
    herdr: { workspace_id: null, pane_id: null, agent_name: null },
    blockers: [],
    worktree: false,
    body: "",
    filePath: "",
    ...partial,
  }
}

test("inProgressPaneIds joins stored pane_id only", () => {
  expect(
    inProgressPaneIds([
      task({ id: "dev-1", status: "backlog", herdr: { workspace_id: "w1", pane_id: "w1:p1", agent_name: null } }),
      task({ id: "dev-2", status: "in_progress" }),
      task({ id: "dev-3", status: "in_progress", herdr: { workspace_id: "wP", pane_id: "wP:pV", agent_name: null } }),
      task({ id: "dev-4", status: "in_progress", herdr: { workspace_id: "wP", pane_id: "wP:pV", agent_name: null } }),
      task({ id: "dev-5", status: "done", herdr: { workspace_id: "w2", pane_id: "w2:p1", agent_name: null } }),
      task({ id: "dev-6", status: "review", herdr: { workspace_id: "wR", pane_id: "wR:p1", agent_name: null } }),
    ]),
  ).toEqual(["wP:pV", "wR:p1"])
})
