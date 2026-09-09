import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureDir } from "./fs.ts"
import {
  buildCustomLanePrompt,
  insertLaneId,
  isLaunchLane,
  loadLanePromptText,
  looksLikePromptPath,
  parseLaneIds,
  slugLaneId,
} from "./lanes.ts"
import { pathsFor } from "./root.ts"

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

test("slugLaneId derives a valid identifier from a name", () => {
  expect(slugLaneId("QA")).toBe("qa")
  expect(slugLaneId("Code Review")).toBe("code_review")
})

test("insertLaneId places a lane before next_step", () => {
  expect(insertLaneId(["backlog", "in_progress", "review", "done"], "qa", "done")).toEqual([
    "backlog",
    "in_progress",
    "review",
    "qa",
    "done",
  ])
})

test("parseLaneIds accepts custom identifiers", () => {
  expect(parseLaneIds(["backlog", "in_progress", "qa", "done"])).toEqual([
    "backlog",
    "in_progress",
    "qa",
    "done",
  ])
})

test("isLaunchLane treats a prompted custom lane as a launch lane", () => {
  expect(isLaunchLane("qa")).toBe(false)
  expect(isLaunchLane("qa", { qa: { name: "QA", prompt: "Check it.", next_step: "done" } })).toBe(true)
  expect(isLaunchLane("in_progress")).toBe(true)
})

test("buildCustomLanePrompt substitutes ids and appends next_step", () => {
  expect(buildCustomLanePrompt("Look at <id>.", "dev-1", "done")).toBe(
    "Look at dev-1.\nWhen complete: `htasks move dev-1 done`.",
  )
  expect(buildCustomLanePrompt("When complete: `htasks move <id> done`.", "dev-1", "done")).toBe(
    "When complete: `htasks move dev-1 done`.",
  )
})

test("loadLanePromptText reads a file from prompts/ and keeps inline text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "htasks-lane-prompt-"))
  dirs.push(dir)
  const paths = pathsFor(dir)
  await ensureDir(paths.promptsDir)
  await Bun.write(join(paths.promptsDir, "qa.md"), "QA the change.\n")
  expect(await loadLanePromptText(paths, "qa.md")).toBe("QA the change.")
  expect(await loadLanePromptText(paths, "prompts/qa.md")).toBe("QA the change.")
  expect(await loadLanePromptText(paths, "Check the tests.")).toBe("Check the tests.")
})

test("looksLikePromptPath ignores spaced prose even when it mentions files", () => {
  expect(looksLikePromptPath("qa.md")).toBe(true)
  expect(looksLikePromptPath("prompts/qa.md")).toBe(true)
  expect(looksLikePromptPath("Update README.md")).toBe(false)
  expect(looksLikePromptPath("Review src/lib")).toBe(false)
})

test("loadLanePromptText does not read a board-root file from spaced prose", async () => {
  const dir = await mkdtemp(join(tmpdir(), "htasks-lane-inline-"))
  dirs.push(dir)
  const paths = pathsFor(dir)
  await Bun.write(join(dir, "README.md"), "do not use this\n")
  expect(await loadLanePromptText(paths, "Update README.md")).toBe("Update README.md")
})
