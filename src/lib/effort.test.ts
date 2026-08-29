import { expect, test } from "bun:test"
import { commandWithEffort, effortArgs, normalizeEffort } from "./effort.ts"

test("normalizeEffort accepts known levels and none", () => {
  expect(normalizeEffort(undefined)).toBe("")
  expect(normalizeEffort("")).toBe("")
  expect(normalizeEffort("none")).toBe("")
  expect(normalizeEffort(" high ")).toBe("high")
  expect(normalizeEffort("xhigh")).toBe("xhigh")
})

test("normalizeEffort rejects unknown levels", () => {
  expect(() => normalizeEffort("turbo")).toThrow(/Unknown effort 'turbo'/)
  expect(() => normalizeEffort("off")).toThrow(/Known: low, medium, high, xhigh, max/)
})

test("effortArgs is kind-specific and omitted when empty", () => {
  expect(effortArgs("pi", "")).toBeUndefined()
  expect(effortArgs("pi", "high")).toBe("--thinking high")
  expect(effortArgs("claude", "high")).toBe("--effort high")
  expect(effortArgs("grok", "low")).toBe("--effort low")
  expect(effortArgs("codex", "high")).toBe("-c model_reasoning_effort=high")
  expect(effortArgs("codex", "max")).toBe("-c model_reasoning_effort=xhigh")
  expect(effortArgs(undefined, "medium")).toBe("--effort medium")
})

test("commandWithEffort appends flags to the mapped command", () => {
  expect(commandWithEffort("pi", "pi", "")).toBe("pi")
  expect(commandWithEffort("pi", "pi", "high")).toBe("pi --thinking high")
  expect(commandWithEffort("ccc", "claude", "high")).toBe("ccc --effort high")
  expect(commandWithEffort("codex --yolo", "codex", "low")).toBe(
    "codex --yolo -c model_reasoning_effort=low",
  )
})
