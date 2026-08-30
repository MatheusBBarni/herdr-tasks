import { LANES, type Lane, type Task } from "./types.ts"

export function parseOrder(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string") {
    const n = Number(value.trim())
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return 0
}

export function compareTaskOrder(a: Task, b: Task): number {
  if (a.order !== b.order) return a.order - b.order
  return a.id.localeCompare(b.id)
}

export function compareTasks(a: Task, b: Task): number {
  const lane = LANES.indexOf(a.status) - LANES.indexOf(b.status)
  if (lane !== 0) return lane
  return compareTaskOrder(a, b)
}

export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(compareTasks)
}

export function tasksInLane(tasks: readonly Task[], lane: Lane): Task[] {
  return tasks.filter((task) => task.status === lane).sort(compareTaskOrder)
}

export function nextOrder(tasks: readonly Task[], lane: Lane, exceptId?: string): number {
  let max = -1
  for (const task of tasks) {
    if (exceptId && task.id === exceptId) continue
    if (task.status === lane && task.order > max) max = task.order
  }
  return max + 1
}

export function applyReorder(
  tasks: readonly Task[],
  id: string,
  dir: -1 | 1,
  now = new Date().toISOString(),
): { tasks: Task[]; changed: Task[] } {
  const unchanged = { tasks: [...tasks], changed: [] as Task[] }
  const current = tasks.find((task) => task.id === id)
  if (!current) return unchanged
  const lane = tasksInLane(tasks, current.status)
  const idx = lane.findIndex((task) => task.id === id)
  const dest = idx + dir
  if (idx < 0 || dest < 0 || dest >= lane.length) return unchanged
  const nextLane = [...lane]
  const left = nextLane[idx]
  const right = nextLane[dest]
  if (!left || !right) return unchanged
  nextLane[idx] = right
  nextLane[dest] = left
  const changed: Task[] = []
  const rewritten = nextLane.map((task, order) => {
    if (task.order === order) return task
    const next = { ...task, order, updated: now }
    changed.push(next)
    return next
  })
  const byId = new Map(rewritten.map((task) => [task.id, task]))
  return {
    tasks: sortTasks(tasks.map((task) => byId.get(task.id) ?? task)),
    changed,
  }
}
