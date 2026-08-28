export function colorEnabled(stream: { isTTY?: boolean } = process.stdout): boolean {
  if (process.env.NO_COLOR) return false
  if (process.env.TERM === "dumb") return false
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true
  return Boolean(stream.isTTY)
}

const codes = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
}

export function paint(enabled: boolean, code: keyof typeof codes, text: string): string {
  if (!enabled) return text
  return `${codes[code]}${text}${codes.reset}`
}
