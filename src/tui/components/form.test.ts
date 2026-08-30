import { expect, test } from "bun:test"
import { EMPTY_REVIEW, type Config } from "../../lib/types.ts"
import { classifyFormError, defaultFormValues, formLayout } from "./form.tsx"

function cfg(partial: Partial<Config> = {}): Config {
  return {
    prefix: "dev",
    default_agent: "pi",
    default_project: "",
    theme: "nord",
    lanes: ["backlog", "in_progress", "review", "done"],
    next_id: 1,
    herdr_bin: "herdr",
    herdr_behavior: "workspace",
    agents: { pi: { command: "pi", kind: "pi" } },
    projects: {},
    task_types: ["feat", "fix"],
    default_type: "feat",
    review: { ...EMPTY_REVIEW },
    ...partial,
  }
}

test("formLayout centers a compact dialog at 80x24", () => {
  const layout = formLayout(80, 24)
  expect(layout.dialogWidth).toBe(72)
  expect(layout.stackFields).toBe(false)
  expect(layout.descriptionRows).toBeGreaterThanOrEqual(3)
  expect(layout.descriptionRows).toBeLessThanOrEqual(6)
})

test("formLayout stacks agent and project below 70 columns", () => {
  const layout = formLayout(60, 24)
  expect(layout.stackFields).toBe(true)
  expect(layout.dialogWidth).toBeLessThan(60)
  expect(layout.descriptionRows).toBeGreaterThanOrEqual(3)
  expect(layout.descriptionRows).toBeLessThanOrEqual(4)
})

test("formLayout grows description on a tall terminal but caps it", () => {
  const layout = formLayout(100, 40)
  expect(layout.dialogWidth).toBe(80)
  expect(layout.stackFields).toBe(false)
  expect(layout.descriptionRows).toBe(8)
})

test("classifyFormError puts messages under the matching field", () => {
  expect(classifyFormError("Title is required.")).toEqual({ title: "Title is required." })
  expect(classifyFormError("Unknown type 'epic'. Known: feat, fix")).toEqual({
    type: "Unknown type 'epic'. Known: feat, fix",
  })
  expect(classifyFormError("Unknown agent 'nope'. Known: pi")).toEqual({
    agent: "Unknown agent 'nope'. Known: pi",
  })
  expect(classifyFormError("Unknown effort 'turbo'. Known: low, medium, high, xhigh, max.")).toEqual({
    effort: "Unknown effort 'turbo'. Known: low, medium, high, xhigh, max.",
  })
  expect(classifyFormError("Unknown blocker 'dev-99'.")).toEqual({
    blockers: "Unknown blocker 'dev-99'.",
  })
  expect(classifyFormError("Unknown worktree 'maybe'. Use yes or no.")).toEqual({
    worktree: "Unknown worktree 'maybe'. Use yes or no.",
  })
  expect(classifyFormError("Project path does not exist: /tmp/missing")).toEqual({
    project: "Project path does not exist: /tmp/missing",
  })
  expect(classifyFormError("something else")).toEqual({ form: "something else" })
  expect(classifyFormError(null)).toEqual({})
})

test("defaultFormValues uses cwd when no projects are listed", () => {
  expect(defaultFormValues(cfg(), "/cwd").project).toBe("/cwd")
  expect(defaultFormValues(cfg({ default_project: "/mine" }), "/cwd").project).toBe("/mine")
  expect(defaultFormValues(cfg(), "/cwd").worktree).toBe(false)
})

test("defaultFormValues picks a listed project", () => {
  const config = cfg({
    projects: {
      alpha: { name: "A", path: "/a" },
      beta: { name: "B", path: "/b" },
    },
  })
  expect(defaultFormValues(config, "/cwd").project).toBe("/a")
  expect(defaultFormValues(config, "/b").project).toBe("/b")
  expect(
    defaultFormValues({ ...config, default_project: "beta" }, "/cwd").project,
  ).toBe("/b")
})
