import { expect, test } from "bun:test"
import { hrefForDisplay, parseDescriptionParts } from "./description.ts"

test("markdown image becomes a link to the image URL, not an embed", () => {
  expect(parseDescriptionParts("See ![login](https://ex.com/a.png) please")).toEqual([
    { type: "text", value: "See " },
    { type: "link", label: "login  https://ex.com/a.png", href: "https://ex.com/a.png" },
    { type: "text", value: " please" },
  ])
})

test("image without alt uses the URL as the link label", () => {
  expect(parseDescriptionParts("![](https://ex.com/a.png)")).toEqual([
    { type: "link", label: "https://ex.com/a.png", href: "https://ex.com/a.png" },
  ])
})

test("angle-bracket image href", () => {
  expect(parseDescriptionParts("![shot](<./shot.png>)")).toEqual([
    { type: "link", label: "shot  ./shot.png", href: "./shot.png" },
  ])
})

test("markdown link keeps its label", () => {
  expect(parseDescriptionParts("[docs](https://ex.com)")).toEqual([
    { type: "link", label: "docs", href: "https://ex.com" },
  ])
})

test("bare and angle URLs become links", () => {
  expect(parseDescriptionParts("go https://ex.com/a.png now")).toEqual([
    { type: "text", value: "go " },
    { type: "link", label: "https://ex.com/a.png", href: "https://ex.com/a.png" },
    { type: "text", value: " now" },
  ])
  expect(parseDescriptionParts("go <https://ex.com/a.png> now")).toEqual([
    { type: "text", value: "go " },
    { type: "link", label: "https://ex.com/a.png", href: "https://ex.com/a.png" },
    { type: "text", value: " now" },
  ])
})

test("unfinished markdown is left as text", () => {
  expect(parseDescriptionParts("![nope](http")).toEqual([{ type: "text", value: "![nope](http" }])
  expect(parseDescriptionParts("[nope](http")).toEqual([{ type: "text", value: "[nope](http" }])
})

test("hrefForDisplay leaves http(s) alone and file-ifies local paths", () => {
  expect(hrefForDisplay("https://ex.com/a.png")).toBe("https://ex.com/a.png")
  expect(hrefForDisplay("./shot.png", "/board/.herdr-tasks/tasks/dev-1.md")).toBe(
    "file:///board/.herdr-tasks/tasks/shot.png",
  )
  expect(hrefForDisplay("/tmp/shot.png")).toBe("file:///tmp/shot.png")
})
