import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
  type CliRenderer,
} from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"

export type CopyScreen = "board" | "form" | "preview" | "help" | "settings"

type CopyKey = {
  name: string
  ctrl: boolean
  shift?: boolean
  meta?: boolean
}

type CopyParts = {
  editorSelected: string
  selection: string
  editorValue: string
  fallback: string
}

type PasteEditor = {
  hasSelection(): boolean
  deleteSelection(): boolean
  insertText(text: string): void
}

export function isCopyChord(key: CopyKey): boolean {
  return key.ctrl && key.name === "c" && !key.shift && !key.meta
}

export function isPasteChord(key: CopyKey): boolean {
  return key.ctrl && key.name === "v" && !key.shift && !key.meta
}

export function copyText(parts: CopyParts): string {
  if (parts.editorSelected) return parts.editorSelected
  if (parts.selection) return parts.selection
  if (parts.editorValue) return parts.editorValue
  return parts.fallback
}

export function fallbackCopyText(opts: {
  screen: CopyScreen
  task: { id: string; title: string; body: string } | null
}): string {
  const task = opts.task
  if (!task) return ""
  if (opts.screen === "preview") {
    const body = task.body.trim()
    if (body) return body
  }
  return `${task.id}  ${task.title}`
}

export function applyPaste(editor: PasteEditor, text: string): boolean {
  if (!text) return false
  if (editor.hasSelection()) editor.deleteSelection()
  editor.insertText(text)
  return true
}

export async function writeClipboard(renderer: CliRenderer, text: string): Promise<void> {
  if (!text) return
  try {
    const clipboard = createClipboard({
      host: createHostClipboard(),
      terminal: createRendererClipboardAdapter(renderer),
    })
    try {
      await clipboard.writeText(text, { destination: "best-available" })
    } finally {
      await clipboard.dispose()
    }
  } catch {
    renderer.copyToClipboardOSC52(text)
  }
}

export async function readClipboardText(): Promise<string> {
  try {
    const host = createHostClipboard()
    try {
      const result = await host.read({ preferredTypes: ["text/plain"] })
      if (result.status !== "read") return ""
      return new TextDecoder().decode(result.representation.bytes)
    } finally {
      await host.dispose()
    }
  } catch {
    return ""
  }
}

export function useCopyPaste(getFallback: () => string): void {
  const renderer = useRenderer()
  useKeyboard((key) => {
    if (isCopyChord(key)) {
      key.preventDefault?.()
      const editor = renderer.currentFocusedEditor
      const text = copyText({
        editorSelected: editor?.getSelectedText() ?? "",
        selection: renderer.getSelection()?.getSelectedText() ?? "",
        editorValue: editor?.plainText ?? "",
        fallback: getFallback(),
      })
      if (text) void writeClipboard(renderer, text)
      return
    }
    if (isPasteChord(key)) {
      key.preventDefault?.()
      const editor = renderer.currentFocusedEditor
      if (!editor) return
      void readClipboardText().then((text) => {
        applyPaste(editor, text)
      })
    }
  })
}
