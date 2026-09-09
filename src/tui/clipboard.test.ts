import { expect, test } from "bun:test"
import {
  applyPaste,
  copyText,
  fallbackCopyText,
  isCopyChord,
  isPasteChord,
} from "./clipboard.ts"

test("Ctrl+C copies and Ctrl+V pastes; quit is not a copy chord", () => {
  expect(isCopyChord({ name: "c", ctrl: true })).toBe(true)
  expect(isPasteChord({ name: "v", ctrl: true })).toBe(true)
  expect(isCopyChord({ name: "c", ctrl: false })).toBe(false)
  expect(isCopyChord({ name: "c", ctrl: true, shift: true })).toBe(false)
  expect(isPasteChord({ name: "v", ctrl: true, meta: true })).toBe(false)
})

test("copy prefers editor selection, then board selection, then field, then fallback", () => {
  expect(
    copyText({
      editorSelected: "sel",
      selection: "board",
      editorValue: "field",
      fallback: "card",
    }),
  ).toBe("sel")
  expect(
    copyText({
      editorSelected: "",
      selection: "board",
      editorValue: "field",
      fallback: "card",
    }),
  ).toBe("board")
  expect(
    copyText({
      editorSelected: "",
      selection: "",
      editorValue: "field",
      fallback: "card",
    }),
  ).toBe("field")
  expect(
    copyText({
      editorSelected: "",
      selection: "",
      editorValue: "",
      fallback: "card",
    }),
  ).toBe("card")
})

test("preview copies the task body; board copies id and title", () => {
  const task = { id: "dev-29", title: "Copy paste", body: "# Copy paste\n\nDo it." }
  expect(fallbackCopyText({ screen: "preview", task })).toBe("# Copy paste\n\nDo it.")
  expect(fallbackCopyText({ screen: "board", task })).toBe("dev-29  Copy paste")
  expect(fallbackCopyText({ screen: "board", task: null })).toBe("")
})

test("paste replaces a selection then inserts", () => {
  const calls: string[] = []
  const editor = {
    selected: true,
    hasSelection() {
      return this.selected
    },
    deleteSelection() {
      this.selected = false
      calls.push("delete")
      return true
    },
    insertText(text: string) {
      calls.push(`insert:${text}`)
    },
  }
  expect(applyPaste(editor, "")).toBe(false)
  expect(applyPaste(editor, "hello")).toBe(true)
  expect(calls).toEqual(["delete", "insert:hello"])
  expect(applyPaste(editor, " again")).toBe(true)
  expect(calls).toEqual(["delete", "insert:hello", "insert: again"])
})
