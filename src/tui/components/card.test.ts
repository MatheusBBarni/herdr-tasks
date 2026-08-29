import { expect, test } from "bun:test"
import { cellWidth } from "../../lib/text.ts"
import { cardMeta, cardMetaLine } from "./card.tsx"

const project = "/Users/matheusbbarni/projects/herdr-tasks"

test("cardMeta keeps starting… during launch and does not mix in live status", () => {
  expect(
    cardMeta({ launching: true, status: "working", agent: "pi", project }),
  ).toBe("starting…")
})

test("cardMeta is status, agent key, and project basename", () => {
  expect(cardMeta({ launching: false, status: "working", agent: "pi", project })).toBe(
    "working  pi  herdr-tasks",
  )
  expect(cardMeta({ launching: false, status: "gone", agent: "pi", project })).toBe(
    "gone  pi  herdr-tasks",
  )
  expect(cardMeta({ launching: false, agent: "pi", project })).toBe("pi  herdr-tasks")
  expect(cardMeta({ launching: false, type: "feat", agent: "pi", project })).toBe(
    "feat  pi  herdr-tasks",
  )
  expect(
    cardMeta({ launching: false, status: "working", type: "bug", agent: "pi", project }),
  ).toBe("bug  working  pi  herdr-tasks")
})

test("cardMetaLine truncates by cell width at 80×24 three-column and 60-col floor", () => {
  const opts = { launching: false, status: "working" as const, agent: "pi", project }
  const col80 = cardMetaLine(26, opts)
  expect(col80).toContain("working")
  expect(col80).toContain("pi")
  expect(cellWidth(col80)).toBeLessThanOrEqual(24)

  const col60 = cardMetaLine(60, opts)
  expect(col60).toContain("working  pi  herdr-tasks")
  expect(col60).not.toContain("…")
  expect(cellWidth(col60)).toBeLessThanOrEqual(58)
})
