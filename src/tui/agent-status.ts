import { useEffect, useMemo, useState } from "react"
import {
  joinPaneStatuses,
  listAgentStatuses,
  type LiveAgentStatus,
} from "../lib/herdr.ts"
import { isLaunchLane, type Task } from "../lib/types.ts"

const POLL_MS = 1500
const COALESCE_MS = 80

export function inProgressPaneIds(tasks: readonly Task[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const task of tasks) {
    if (!isLaunchLane(task.status)) continue
    const id = task.herdr.pane_id?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function mapsEqual(
  a: ReadonlyMap<string, LiveAgentStatus>,
  b: ReadonlyMap<string, LiveAgentStatus>,
): boolean {
  if (a.size !== b.size) return false
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false
  }
  return true
}

export function useAgentStatuses(
  enabled: boolean,
  bin: string,
  tasks: readonly Task[],
): ReadonlyMap<string, LiveAgentStatus> {
  const paneKey = useMemo(() => inProgressPaneIds(tasks).join("\0"), [tasks])
  const [statuses, setStatuses] = useState<Map<string, LiveAgentStatus>>(() => new Map())

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let inFlight = false
    let pending = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let coalesceTimer: ReturnType<typeof setTimeout> | undefined

    const apply = (next: Map<string, LiveAgentStatus>) => {
      if (cancelled) return
      setStatuses((prev) => (mapsEqual(prev, next) ? prev : next))
    }

    const paneIds = paneKey ? paneKey.split("\0") : []

    const refresh = async () => {
      if (cancelled) return
      if (inFlight) {
        pending = true
        return
      }
      inFlight = true
      try {
        if (paneIds.length === 0) {
          apply(new Map())
          return
        }
        let listed: Awaited<ReturnType<typeof listAgentStatuses>> | null = null
        try {
          listed = await listAgentStatuses(bin)
        } catch {
          listed = null
        }
        apply(joinPaneStatuses(paneIds, listed))
      } finally {
        inFlight = false
        if (cancelled) return
        if (pending) {
          pending = false
          schedule(COALESCE_MS)
          return
        }
        if (paneIds.length > 0) schedule(POLL_MS)
      }
    }

    const schedule = (ms: number) => {
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = setTimeout(() => {
        pollTimer = undefined
        void refresh()
      }, ms)
    }

    coalesceTimer = setTimeout(() => {
      coalesceTimer = undefined
      void refresh()
    }, COALESCE_MS)

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
      if (coalesceTimer) clearTimeout(coalesceTimer)
    }
  }, [enabled, bin, paneKey])

  return statuses
}
