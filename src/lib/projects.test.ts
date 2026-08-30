import { expect, test } from "bun:test"
import {
  defaultProjectPath,
  findProject,
  listedProjects,
  parseProjects,
  resolveProjectInput,
} from "./projects.ts"
import { EMPTY_REVIEW, type Config } from "./types.ts"

function cfg(partial: Partial<Config> = {}): Config {
  return {
    prefix: "dev",
    default_agent: "claude",
    default_project: "",
    theme: "nord",
    lanes: ["backlog", "in_progress", "review", "done"],
    next_id: 1,
    herdr_bin: "herdr",
    herdr_behavior: "workspace",
    agents: { claude: { command: "ccc", kind: "claude" } },
    task_types: ["feat"],
    default_type: "feat",
    projects: {},
    review: { ...EMPTY_REVIEW },
    ...partial,
  }
}

test("parseProjects reads name and path", () => {
  expect(
    parseProjects({
      "herdr-tasks": { name: "herdr-tasks", path: "/repo/htasks" },
      other: { path: "/repo/other" },
    }),
  ).toEqual({
    "herdr-tasks": { name: "herdr-tasks", path: "/repo/htasks" },
    other: { name: "other", path: "/repo/other" },
  })
})

test("parseProjects ignores missing table and fails on empty path", () => {
  expect(parseProjects(undefined)).toEqual({})
  expect(parseProjects([])).toEqual({})
  expect(() => parseProjects({ broken: { name: "broken" } })).toThrow(/missing path/)
})

test("listedProjects sorts by key", () => {
  const config = cfg({
    projects: {
      zeta: { name: "Z", path: "/z" },
      alpha: { name: "A", path: "/a" },
    },
  })
  expect(listedProjects(config).map((project) => project.key)).toEqual(["alpha", "zeta"])
})

test("findProject matches key or path", () => {
  const config = cfg({
    projects: { "herdr-tasks": { name: "herdr-tasks", path: "/repo/htasks" } },
  })
  expect(findProject(config, "herdr-tasks")?.path).toBe("/repo/htasks")
  expect(findProject(config, "/repo/htasks")?.key).toBe("herdr-tasks")
  expect(findProject(config, "nope")).toBeUndefined()
})

test("resolveProjectInput maps keys to paths and rejects unknown keys", () => {
  const config = cfg({
    projects: { "herdr-tasks": { name: "herdr-tasks", path: "/repo/htasks" } },
  })
  expect(resolveProjectInput(config, "herdr-tasks", "/cwd")).toBe("/repo/htasks")
  expect(resolveProjectInput(config, "/custom", "/cwd")).toBe("/custom")
  expect(resolveProjectInput(config, undefined, "/cwd")).toBe("/cwd")
  expect(() => resolveProjectInput(config, "nope", "/cwd")).toThrow(/Unknown project 'nope'/)
})

test("resolveProjectInput keeps free paths when no list is present", () => {
  expect(resolveProjectInput(cfg(), "nope", "/cwd")).toBe("nope")
})

test("defaultProjectPath prefers default, then cwd match, then first listed", () => {
  const listed = {
    alpha: { name: "A", path: "/a" },
    beta: { name: "B", path: "/b" },
  }
  expect(defaultProjectPath(cfg({ default_project: "/mine" }), "/cwd")).toBe("/mine")
  expect(
    defaultProjectPath(cfg({ default_project: "beta", projects: listed }), "/cwd"),
  ).toBe("/b")
  expect(defaultProjectPath(cfg({ projects: listed }), "/b")).toBe("/b")
  expect(defaultProjectPath(cfg({ projects: listed }), "/cwd")).toBe("/a")
  expect(defaultProjectPath(cfg(), "/cwd")).toBe("/cwd")
})
