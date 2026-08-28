import { expect, test } from "bun:test"
import { classifyFormError, formLayout } from "./form.tsx"

test("formLayout centers a compact dialog at 80x24", () => {
  const layout = formLayout(80, 24)
  expect(layout.dialogWidth).toBe(72)
  expect(layout.stackFields).toBe(false)
  expect(layout.descriptionRows).toBeGreaterThanOrEqual(4)
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
  expect(classifyFormError("Unknown agent 'nope'. Known: pi")).toEqual({
    agent: "Unknown agent 'nope'. Known: pi",
  })
  expect(classifyFormError("Project path does not exist: /tmp/missing")).toEqual({
    project: "Project path does not exist: /tmp/missing",
  })
  expect(classifyFormError("something else")).toEqual({ form: "something else" })
  expect(classifyFormError(null)).toEqual({})
})
