import { expect, test } from "bun:test"
import { formatTaskId, isSafeAgentName, parseTaskId, slugAgentName } from "./ids.ts"

test("format and parse task ids", () => {
  expect(formatTaskId("dev", 1)).toBe("dev-1")
  expect(parseTaskId("dev-12")).toEqual({ prefix: "dev", n: 12 })
  expect(parseTaskId("nope")).toBeNull()
})

test("slugAgentName matches herdr name rules", () => {
  expect(slugAgentName("dev-1")).toBe("dev-1")
  expect(isSafeAgentName(slugAgentName("dev-1"))).toBe(true)
  const taken = slugAgentName("dev-1", ["dev-1"])
  expect(taken).toBe("dev-1-2")
  expect(isSafeAgentName(taken)).toBe(true)
  expect(slugAgentName("9lives")).toBe("lives")
})
