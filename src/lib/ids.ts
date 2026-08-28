const ID_RE = /^([a-z][a-z0-9_-]*)-(\d+)$/i
const SAFE_NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/

export function formatTaskId(prefix: string, n: number): string {
  return `${prefix}-${n}`
}

export function parseTaskId(id: string): { prefix: string; n: number } | null {
  const match = ID_RE.exec(id.trim())
  if (!match) return null
  const prefix = match[1]
  const n = match[2]
  if (!prefix || !n) return null
  return { prefix, n: Number(n) }
}

export function taskFilename(id: string): string {
  return `${id}.md`
}

export function slugAgentName(taskId: string, used: Iterable<string> = []): string {
  const taken = new Set(used)
  const lowered = taskId.toLowerCase()
  let slug = lowered.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "")
  slug = slug.replace(/^[^a-z]+/, "")
  if (!slug) slug = "task"
  slug = slug.slice(0, 32)
  if (!SAFE_NAME_RE.test(slug)) {
    slug = `t${slug.replace(/[^a-z0-9_-]/g, "")}`.slice(0, 32)
  }
  if (!SAFE_NAME_RE.test(slug)) slug = "task"
  if (!taken.has(slug)) return slug
  let i = 2
  while (i < 1000) {
    const suffix = `-${i}`
    const candidate = `${slug.slice(0, 32 - suffix.length)}${suffix}`
    if (SAFE_NAME_RE.test(candidate) && !taken.has(candidate)) return candidate
    i += 1
  }
  return `task${Date.now().toString(36)}`.slice(0, 32)
}

export function isSafeAgentName(name: string): boolean {
  return SAFE_NAME_RE.test(name)
}
