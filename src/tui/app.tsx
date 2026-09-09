import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { agentKeys } from "../lib/agents.ts"
import { listedProjects } from "../lib/projects.ts"
import { applySettings } from "../lib/config.ts"
import { CliError } from "../lib/errors.ts"
import { closeTaskLayout, focusTaskLayout, hasHerdrLayout, resolveHerdrBin } from "../lib/herdr.ts"
import { completeLaneLaunch, moveTask, moveTaskDetailed } from "../lib/move.ts"
import type { BoardPaths } from "../lib/root.ts"
import { applyReorder, tasksInLane } from "../lib/order.ts"
import { createTask, editTask, loadBoard, saveTask, writeTask } from "../lib/store.ts"
import { basename } from "../lib/text.ts"
import { DEFAULT_THEME, THEMES, type ThemeName } from "../lib/themes.ts"
import { EMPTY_HERDR, LANES, type Config, type Lane, type Task } from "../lib/types.ts"
import { isLaunchLane } from "../lib/lanes.ts"
import { watchTasks } from "../lib/watch.ts"
import { useAgentStatuses } from "./agent-status.ts"
import { fallbackCopyText, useCopyPaste } from "./clipboard.ts"
import { Board } from "./components/board.tsx"
import { defaultFormValues, descriptionFromBody, TaskForm, type FormValues } from "./components/form.tsx"
import { HelpOverlay, PreviewOverlay, TooSmall } from "./components/overlays.tsx"
import { SettingsForm, type SettingsValues } from "./components/settings.tsx"
import type { ToastInfo, ToastKind } from "./components/toast.tsx"
import { filterTasks } from "./filter.ts"
import { ThemeProvider, tuiColor } from "./theme.ts"

type Screen = "board" | "form" | "preview" | "help" | "settings"

type AppProps = {
  paths: BoardPaths
  cwd: string
  initialConfig: Config
  initialTasks: Task[]
}

function adjacentLane(lane: Lane, dir: number, lanes: readonly string[] = LANES): Lane {
  const order = lanes.length > 0 ? lanes : LANES
  const idx = order.indexOf(lane)
  const from = idx < 0 ? 0 : idx
  const next = Math.min(order.length - 1, Math.max(0, from + dir))
  return order[next] ?? lane
}

function withoutId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids)
  next.delete(id)
  return next
}

function firstVisibleId(list: readonly Task[], id: string | null): string | null {
  if (id && list.some((task) => task.id === id)) return id
  return list[0]?.id ?? null
}

export function App(props: AppProps) {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const color = tuiColor()
  const [config, setConfig] = useState(props.initialConfig)
  const [tasks, setTasks] = useState(props.initialTasks)
  const [screen, setScreen] = useState<Screen>("board")
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [formInitial, setFormInitial] = useState<FormValues>(() =>
    defaultFormValues(props.initialConfig, props.cwd),
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [previewTheme, setPreviewTheme] = useState<ThemeName | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focusedLane, setFocusedLane] = useState<Lane>("backlog")
  const [focusedId, setFocusedId] = useState<string | null>(props.initialTasks[0]?.id ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterQueries, setFilterQueries] = useState<Partial<Record<Lane, string>>>({})
  const [filterLane, setFilterLane] = useState<Lane | null>(null)
  const [toast, setToast] = useState<ToastInfo | null>(null)
  const [launchingIds, setLaunchingIds] = useState<Set<string>>(() => new Set())
  const dragId = useRef<string | null>(null)
  const closingRef = useRef(false)
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const filterQueriesRef = useRef(filterQueries)
  filterQueriesRef.current = filterQueries

  const showToast = useCallback((message: string, kind: ToastKind = "ok") => {
    setToast({ message, kind })
  }, [])

  useEffect(() => {
    if (!toast) return
    const ms = toast.kind === "error" ? 5000 : 2500
    const timer = setTimeout(() => setToast(null), ms)
    return () => clearTimeout(timer)
  }, [toast])

  const reload = useCallback(async () => {
    try {
      const board = await loadBoard(props.paths)
      setConfig(board.config)
      setTasks(board.tasks)
      setFocusedLane((prev) => (board.config.lanes.includes(prev) ? prev : (board.config.lanes[0] ?? "backlog")))
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error")
    }
  }, [props.paths, showToast])

  useEffect(() => watchTasks(props.paths, () => void reload()), [props.paths, reload])

  const focusedTask = useMemo(
    () => tasks.find((task) => task.id === focusedId) ?? null,
    [tasks, focusedId],
  )

  const previewTask = focusedTask

  const tooSmall = width < 40 || height < 10
  const singlePane = width < 80
  const herdrBin = resolveHerdrBin(config.herdr_bin)
  const agentStatuses = useAgentStatuses(screen === "board" && !tooSmall, herdrBin, tasks, config.lane_defs)
  const activeTheme = previewTheme ?? config.theme ?? DEFAULT_THEME
  const palette = THEMES[activeTheme] ?? THEMES[DEFAULT_THEME]

  const focusInLane = useCallback(
    (lane: Lane, id: string | null) => {
      setFocusedLane(lane)
      const list = filterTasks(
        tasksInLane(tasksRef.current, lane),
        filterQueriesRef.current[lane] ?? "",
      )
      setFocusedId(firstVisibleId(list, id))
    },
    [],
  )

  const moveFocused = useCallback(
    (dir: -1 | 1) => {
      const list = filterTasks(
        tasksInLane(tasksRef.current, focusedLane),
        filterQueriesRef.current[focusedLane] ?? "",
      )
      if (list.length === 0) return
      const idx = list.findIndex((task) => task.id === focusedId)
      const next = list[Math.min(list.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir))]
      if (next) setFocusedId(next.id)
    },
    [focusedLane, focusedId],
  )

  const reorderSelected = useCallback(
    (dir: -1 | 1) => {
      if (!selectedId) return
      const { tasks: next, changed } = applyReorder(tasksRef.current, selectedId, dir, new Date().toISOString(), config.lanes)
      if (changed.length === 0) return
      tasksRef.current = next
      setTasks(next)
      setFocusedId(selectedId)
      void Promise.all(changed.map((task) => writeTask(task))).catch((err) => {
        showToast(err instanceof Error ? err.message : String(err), "error")
        void reload()
      })
    },
    [config.lanes, reload, selectedId, showToast],
  )

  const applyMove = useCallback(
    async (id: string, lane: Lane) => {
      const current = tasksRef.current.find((task) => task.id === id)
      if (!current) return
      if (current.status === lane && !isLaunchLane(lane, config.lane_defs)) return
      const previous = current
      try {
        if (isLaunchLane(lane, config.lane_defs)) {
          const pending = await moveTaskDetailed(props.paths, id, lane, { launch: false })
          setTasks((all) => all.map((task) => (task.id === id ? pending.task : task)))
          if (!pending.pendingLaunch) {
            showToast(`${id} ${pending.task.status}`)
            focusInLane(lane, id)
            setSelectedId(null)
            return
          }
          setLaunchingIds((set) => new Set(set).add(id))
          showToast(`${id} starting…`)
          void completeLaneLaunch(pending.pendingLaunch, props.paths, pending.task)
            .then((result) => {
              setTasks((all) => all.map((task) => (task.id === id ? result.task : task)))
              showToast(
                result.warning ?? `${id} ${result.task.status}`,
                result.warning ? "error" : "ok",
              )
            })
            .catch(async (err) => {
              await writeTask(previous)
              setTasks((all) => all.map((task) => (task.id === id ? previous : task)))
              showToast(err instanceof Error ? err.message : String(err), "error")
            })
            .finally(() => {
              setLaunchingIds((set) => withoutId(set, id))
            })
        } else {
          const updated = await moveTask(props.paths, id, lane)
          setTasks((all) => all.map((task) => (task.id === id ? updated : task)))
          showToast(`${id} ${updated.status}`)
        }
        focusInLane(lane, id)
        setSelectedId(null)
      } catch (err) {
        setLaunchingIds((set) => withoutId(set, id))
        showToast(err instanceof Error ? err.message : String(err), "error")
      }
    },
    [config.lane_defs, focusInLane, props.paths, showToast],
  )

  const openCreate = useCallback(() => {
    setFormMode("create")
    setEditingId(null)
    setFormInitial(defaultFormValues(config, props.cwd))
    setFormError(null)
    setScreen("form")
  }, [config, props.cwd])

  const openHerdr = useCallback(() => {
    const task = tasksRef.current.find((item) => item.id === focusedId)
    if (!task) {
      showToast("No task focused.", "error")
      return
    }
    if (!isLaunchLane(task.status, config.lane_defs)) {
      showToast(`${task.id} is not in a launch lane.`, "error")
      return
    }
    void focusTaskLayout({
      bin: herdrBin,
      task,
      behavior: config.herdr_behavior,
      laneDefs: config.lane_defs,
    })
      .then((result) => showToast(`focused ${result.noun} ${result.id}`))
      .catch((err) => showToast(err instanceof Error ? err.message : String(err), "error"))
  }, [config.herdr_behavior, config.lane_defs, focusedId, herdrBin, showToast])
  const closeHerdr = useCallback(() => {
    const task = tasksRef.current.find((item) => item.id === focusedId)
    if (!task) {
      showToast("No task focused.", "error")
      return
    }
    if (task.status !== "done" || !hasHerdrLayout(task)) {
      showToast(`${task.id} has no Herdr layout to close.`, "error")
      return
    }
    if (closingRef.current) return
    closingRef.current = true
    void closeTaskLayout({
      bin: herdrBin,
      task,
      behavior: config.herdr_behavior,
    })
      .then(async (result) => {
        const latest = tasksRef.current.find((item) => item.id === task.id) ?? task
        const cleared = {
          ...latest,
          herdr: { ...EMPTY_HERDR },
        }
        const saved = await saveTask(cleared)
        setTasks((all) => all.map((item) => (item.id === saved.id ? saved : item)))
        showToast(
          result.alreadyGone
            ? `${result.noun} already closed`
            : `closed ${result.noun} ${result.id}`,
        )
      })
      .catch((err) => showToast(err instanceof Error ? err.message : String(err), "error"))
      .finally(() => {
        closingRef.current = false
      })
  }, [config.herdr_behavior, focusedId, herdrBin, showToast])

  const openEdit = useCallback(() => {
    const task = tasksRef.current.find((item) => item.id === focusedId)
    if (!task) {
      showToast("No task focused.", "error")
      return
    }
    if (task.status === "done") {
      showToast("Cannot edit a done task.", "error")
      return
    }
    setFormMode("edit")
    setEditingId(task.id)
    setFormInitial({
      title: task.title,
      description: descriptionFromBody(task.title, task.body),
      type: task.type,
      agent: task.agent,
      effort: task.effort,
      project: task.project,
      worktree: task.worktree,
      blockers: task.blockers,
    })
    setFormError(null)
    setScreen("form")
  }, [focusedId, showToast])

  const submitForm = useCallback(
    async (values: FormValues) => {
      const payload = {
        title: values.title,
        description: values.description,
        type: values.type,
        agent: values.agent,
        effort: values.effort,
        project: values.project.trim(),
        blockers: values.blockers,
        worktree: values.worktree,
      }
      try {
        if (formMode === "create") {
          const task = await createTask(props.paths, payload)
          setTasks((all) => [...all, task])
          focusInLane(task.status, task.id)
          showToast(`created ${task.id}`)
        } else if (editingId) {
          const task = await editTask(props.paths, editingId, payload)
          setTasks((all) => all.map((item) => (item.id === task.id ? task : item)))
          showToast(`updated ${task.id}`)
        }
        setScreen("board")
        setFormError(null)
      } catch (err) {
        const message =
          err instanceof CliError ? err.message : err instanceof Error ? err.message : String(err)
        setFormError(message)
      }
    },
    [editingId, focusInLane, formMode, props.paths, showToast],
  )

  const openSettings = useCallback(() => {
    setSettingsError(null)
    setPreviewTheme(null)
    setScreen("settings")
  }, [])

  const closeSettings = useCallback(() => {
    setPreviewTheme(null)
    setSettingsError(null)
    setScreen("board")
  }, [])

  const submitSettings = useCallback(
    async (values: SettingsValues) => {
      try {
        const next = await applySettings(props.paths, values)
        setConfig(next)
        setPreviewTheme(null)
        setSettingsError(null)
        setScreen("board")
        showToast("settings saved")
      } catch (err) {
        const message =
          err instanceof CliError ? err.message : err instanceof Error ? err.message : String(err)
        setSettingsError(message)
      }
    },
    [props.paths, showToast],
  )

  useCopyPaste(() => fallbackCopyText({ screen, task: focusedTask }))

  useKeyboard((key) => {
    if (
      key.name === "q" &&
      !key.ctrl &&
      !key.meta &&
      screen !== "form" &&
      screen !== "settings" &&
      !filterLane
    ) {
      renderer.destroy()
      return
    }
    if (tooSmall) return
    if (screen !== "board") return

    if (filterLane) {
      if (key.name === "escape") {
        key.preventDefault?.()
        const lane = filterLane
        setFilterLane(null)
        setFilterQueries((current) => {
          if (current[lane] == null) return current
          const next = { ...current }
          delete next[lane]
          return next
        })
        setFocusedId(firstVisibleId(tasksInLane(tasksRef.current, lane), focusedId))
        return
      }
      if (key.name === "down") {
        key.preventDefault?.()
        moveFocused(1)
        return
      }
      if (key.name === "up") {
        key.preventDefault?.()
        moveFocused(-1)
        return
      }
      return
    }

    if (key.name === "escape") {
      if (filterQueries[focusedLane]) {
        setFilterQueries((current) => {
          if (current[focusedLane] == null) return current
          const next = { ...current }
          delete next[focusedLane]
          return next
        })
        setFocusedId(firstVisibleId(tasksInLane(tasksRef.current, focusedLane), focusedId))
        return
      }
      setSelectedId(null)
      setToast(null)
      return
    }
    if (key.name === "f" && !key.ctrl && !key.meta && !key.shift) {
      key.preventDefault?.()
      setFilterLane(focusedLane)
      return
    }
    if (key.name === "space") {
      if (!focusedId) return
      setSelectedId((id) => (id === focusedId ? null : focusedId))
      return
    }
    if (key.name === "j" || key.name === "down") {
      key.preventDefault?.()
      if (selectedId) reorderSelected(1)
      else moveFocused(1)
      return
    }
    if (key.name === "k" || key.name === "up") {
      key.preventDefault?.()
      if (selectedId) reorderSelected(-1)
      else moveFocused(-1)
      return
    }
    if (key.name === "h" || key.name === "left" || key.name === "l" || key.name === "right") {
      const dir = key.name === "h" || key.name === "left" ? -1 : 1
      const targetId = selectedId ?? focusedId
      const target = tasksRef.current.find((task) => task.id === targetId)
      if (selectedId && target) {
        void applyMove(target.id, adjacentLane(target.status, dir, config.lanes))
        return
      }
      const nextLane = adjacentLane(focusedLane, dir, config.lanes)
      focusInLane(nextLane, focusedId)
      return
    }
    if (key.name === "c" && !key.ctrl && !key.meta) {
      const task = tasksRef.current.find((item) => item.id === focusedId)
      if (task?.status === "done" && hasHerdrLayout(task)) {
        key.preventDefault?.()
        closeHerdr()
      }
      return
    }
    if (key.name === "n" && !key.ctrl && !key.meta) {
      key.preventDefault?.()
      openCreate()
      return
    }
    if (key.name === "e") {
      key.preventDefault?.()
      openEdit()
      return
    }
    if (key.name === "s" && !key.ctrl && !key.meta && !key.shift) {
      key.preventDefault?.()
      openSettings()
      return
    }
    if (key.name === "o" && !key.ctrl && !key.meta && !key.shift) {
      key.preventDefault?.()
      openHerdr()
      return
    }
    if (key.name === "enter" || key.name === "return") {
      if (!focusedTask) return
      key.preventDefault?.()
      setScreen("preview")
      return
    }
    if (key.name === "?" || key.sequence === "?" || (key.shift && (key.name === "/" || key.name === "slash"))) {
      key.preventDefault?.()
      setScreen("help")
    }
  })

  const onFocusTask = useCallback(
    (id: string) => {
      const task = tasksRef.current.find((item) => item.id === id)
      if (!task) return
      dragId.current = id
      setFilterLane(null)
      setFocusedLane(task.status)
      setFocusedId(id)
      setSelectedId(id)
    },
    [],
  )

  const onDrop = useCallback(
    (lane: Lane) => {
      const id = dragId.current
      dragId.current = null
      if (!id) return
      const task = tasksRef.current.find((item) => item.id === id)
      if (!task || task.status === lane) return
      void applyMove(id, lane)
    },
    [applyMove],
  )

  const onFilterChange = useCallback((lane: Lane, query: string) => {
    setFilterQueries((current) => {
      if (!query) {
        if (current[lane] == null) return current
        const next = { ...current }
        delete next[lane]
        return next
      }
      return { ...current, [lane]: query }
    })
    const list = filterTasks(tasksInLane(tasksRef.current, lane), query)
    setFocusedId((id) => firstVisibleId(list, id))
  }, [])

  const onFilterSubmit = useCallback(() => {
    setFilterLane(null)
  }, [])

  const onFilterFocus = useCallback((lane: Lane) => {
    setFilterLane(lane)
    setFocusedLane(lane)
  }, [])

  const shell = tooSmall ? (
    <box width="100%" height="100%" backgroundColor={color ? palette.bg : undefined}>
      <TooSmall width={width} height={height} />
    </box>
  ) : (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={color ? palette.bg : undefined}
    >
      {screen === "help" ? (
        <HelpOverlay behavior={config.herdr_behavior} onClose={() => setScreen("board")} />
      ) : screen === "preview" && previewTask ? (
        <PreviewOverlay task={previewTask} onClose={() => setScreen("board")} />
      ) : (
        <Board
          tasks={tasks}
          width={width}
          boardName={basename(props.paths.boardRoot)}
          prefix={config.prefix}
          defaultProject={config.default_project}
          singlePane={singlePane}
          focusedLane={focusedLane}
          focusedId={focusedId}
          selectedId={selectedId}
          launchingIds={launchingIds}
          agentStatuses={agentStatuses}
          filterQueries={filterQueries}
          filterLane={filterLane}
          onFilterChange={onFilterChange}
          onFilterSubmit={onFilterSubmit}
          onFilterFocus={onFilterFocus}
          onFocusTask={onFocusTask}
          onDrop={onDrop}
          toast={toast}
          lanes={config.lanes}
          laneDefs={config.lane_defs}
        />
      )}
      {screen === "form" ? (
        <TaskForm
          mode={formMode}
          taskId={editingId}
          initial={formInitial}
          typeKeys={config.task_types}
          agentKeys={agentKeys(config)}
          projectOptions={listedProjects(config)}
          blockerTasks={tasks
            .filter((task) => task.id !== editingId)
            .map((task) => ({ id: task.id, title: task.title }))}
          error={formError}
          onSubmit={(values) => void submitForm(values)}
          onCancel={() => setScreen("board")}
        />
      ) : null}
      {screen === "settings" ? (
        <SettingsForm
          initial={{
            theme: config.theme,
            default_agent: config.default_agent,
            default_project: config.default_project,
            herdr_behavior: config.herdr_behavior,
            herdr_bin: config.herdr_bin,
          }}
          agentKeys={agentKeys(config)}
          error={settingsError}
          onPreviewTheme={setPreviewTheme}
          onSubmit={(values) => void submitSettings(values)}
          onCancel={closeSettings}
        />
      ) : null}
    </box>
  )

  return <ThemeProvider name={activeTheme}>{shell}</ThemeProvider>
}
