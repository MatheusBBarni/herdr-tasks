import { dirname, isAbsolute, resolve } from "node:path"
import { pathToFileURL } from "node:url"

export type DescriptionPart =
  | { type: "text"; value: string }
  | { type: "link"; label: string; href: string }

type MarkdownLink = {
  alt: string
  href: string
  end: number
}

function isUrlScheme(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href)
}

export function hrefForDisplay(href: string, fromFile?: string): string {
  const trimmed = href.trim()
  if (!trimmed) return trimmed
  if (isUrlScheme(trimmed)) return trimmed
  const base = fromFile ? dirname(fromFile) : undefined
  const abs = isAbsolute(trimmed) ? trimmed : base ? resolve(base, trimmed) : resolve(trimmed)
  return pathToFileURL(abs).href
}

function parseHref(text: string, start: number): { href: string; end: number } | null {
  let pos = start
  while (text[pos] === " ") pos++
  if (pos >= text.length) return null
  if (text[pos] === "<") {
    const close = text.indexOf(">", pos + 1)
    if (close < 0) return null
    const href = text.slice(pos + 1, close).trim()
    return href ? { href, end: close + 1 } : null
  }
  const from = pos
  while (pos < text.length && text[pos] !== ")" && text[pos] !== " " && text[pos] !== "\n") pos++
  const href = text.slice(from, pos)
  return href ? { href, end: pos } : null
}

function skipLinkTitle(text: string, start: number): number | null {
  let pos = start
  while (text[pos] === " ") pos++
  const quote = text[pos]
  if (quote === '"' || quote === "'") {
    const close = text.indexOf(quote, pos + 1)
    if (close < 0) return null
    pos = close + 1
    while (text[pos] === " ") pos++
  }
  return pos
}

function parseMarkdownLink(text: string, index: number, image: boolean): MarkdownLink | null {
  let pos = index
  if (image) {
    if (!text.startsWith("![", pos)) return null
    pos += 2
  } else {
    if (text[pos] !== "[") return null
    pos += 1
  }
  const closeAlt = text.indexOf("]", pos)
  if (closeAlt < 0) return null
  const alt = text.slice(pos, closeAlt)
  pos = closeAlt + 1
  if (text[pos] !== "(") return null
  const parsed = parseHref(text, pos + 1)
  if (!parsed) return null
  pos = skipLinkTitle(text, parsed.end) ?? -1
  if (pos < 0 || text[pos] !== ")") return null
  return { alt, href: parsed.href, end: pos + 1 }
}

function parseBareUrl(text: string, index: number): { href: string; end: number } | null {
  const rest = text.slice(index)
  if (!rest.startsWith("https://") && !rest.startsWith("http://")) return null
  let pos = index
  while (pos < text.length && !/[\s<>[\](){}]/.test(text[pos]!)) pos++
  let href = text.slice(index, pos)
  href = href.replace(/[.,;:!?]+$/, "")
  if (href.length < 8) return null
  return { href, end: index + href.length }
}

function parseAngleUrl(text: string, index: number): { href: string; end: number } | null {
  if (text[index] !== "<") return null
  if (!text.startsWith("<http://", index) && !text.startsWith("<https://", index)) return null
  const close = text.indexOf(">", index + 1)
  if (close < 0) return null
  const href = text.slice(index + 1, close).trim()
  if (!href.startsWith("http://") && !href.startsWith("https://")) return null
  return { href, end: close + 1 }
}

function nextCandidate(text: string, from: number): number {
  const found = [
    text.indexOf("![", from),
    text.indexOf("[", from),
    text.indexOf("<http://", from),
    text.indexOf("<https://", from),
    text.indexOf("https://", from),
    text.indexOf("http://", from),
  ].filter((n) => n >= 0)
  return found.length > 0 ? Math.min(...found) : text.length
}

function pushText(parts: DescriptionPart[], value: string): void {
  if (!value) return
  const last = parts[parts.length - 1]
  if (last?.type === "text") {
    last.value += value
    return
  }
  parts.push({ type: "text", value })
}

function imageLabel(alt: string, href: string): string {
  const name = alt.trim()
  return name && name !== href ? `${name}  ${href}` : href
}

export function parseDescriptionParts(text: string): DescriptionPart[] {
  const parts: DescriptionPart[] = []
  let i = 0
  while (i < text.length) {
    const next = nextCandidate(text, i)
    if (next > i) {
      pushText(parts, text.slice(i, next))
      i = next
      continue
    }
    if (text.startsWith("![", i)) {
      const parsed = parseMarkdownLink(text, i, true)
      if (parsed) {
        parts.push({ type: "link", label: imageLabel(parsed.alt, parsed.href), href: parsed.href })
        i = parsed.end
        continue
      }
    } else if (text[i] === "[") {
      const parsed = parseMarkdownLink(text, i, false)
      if (parsed) {
        parts.push({ type: "link", label: parsed.alt.trim() || parsed.href, href: parsed.href })
        i = parsed.end
        continue
      }
    } else if (text[i] === "<") {
      const parsed = parseAngleUrl(text, i)
      if (parsed) {
        parts.push({ type: "link", label: parsed.href, href: parsed.href })
        i = parsed.end
        continue
      }
    } else {
      const parsed = parseBareUrl(text, i)
      if (parsed) {
        parts.push({ type: "link", label: parsed.href, href: parsed.href })
        i = parsed.end
        continue
      }
    }
    pushText(parts, text[i]!)
    i += 1
  }
  return parts
}
