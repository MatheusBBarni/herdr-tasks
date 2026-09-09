import { basename } from "../lib/text.ts"
import type { Task } from "../lib/types.ts"

export function taskSearchText(task: Task): string {
  return [
    task.id,
    task.title,
    task.body,
    task.type,
    task.agent,
    task.effort,
    task.project,
    basename(task.project),
    task.blockers.join(" "),
  ].join("\n")
}

export function taskMatchesQuery(task: Task, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const haystack = taskSearchText(task)
  const caseSensitive = trimmed !== trimmed.toLowerCase()
  const hay = caseSensitive ? haystack : haystack.toLowerCase()
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase()
  for (const token of needle.split(/\s+/)) {
    if (token && !hay.includes(token)) return false
  }
  return true
}

export function filterTasks(tasks: readonly Task[], query: string): Task[] {
  if (!query.trim()) return [...tasks]
  return tasks.filter((task) => taskMatchesQuery(task, query))
}
