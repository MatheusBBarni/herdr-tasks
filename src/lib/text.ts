const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function codepointWidth(cp: number): number {
  if (cp === 0) return 0
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0
  if (cp >= 0x1100 && isWide(cp)) return 2
  return 1
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
}

export function cellWidth(text: string): number {
  let width = 0
  for (const { segment } of segmenter.segment(text)) {
    const cp = segment.codePointAt(0)
    if (cp === undefined) continue
    if (segment.length > 2) {
      width += 2
      continue
    }
    width += codepointWidth(cp)
  }
  return width
}

export function truncateCells(text: string, max: number): string {
  if (max <= 0) return ""
  if (cellWidth(text) <= max) return text
  if (max === 1) return "…"
  const budget = max - 1
  let width = 0
  let out = ""
  for (const { segment } of segmenter.segment(text)) {
    const w = cellWidth(segment)
    if (width + w > budget) break
    out += segment
    width += w
  }
  return `${out}…`
}

export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "")
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
