import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { agentKeys } from "../lib/agents.ts"
import { listedProjects } from "../lib/projects.ts"
import { applySettings } from "../lib/config.ts"
import { CliError } from "../lib/errors.ts"
import { isDirectory } from "../lib/fs.ts"
import { closeTaskLayout, focusTaskLayout, hasHerdrLayout } from "../lib/herdr.ts"
import { completeInProgressLaunch, moveTask } from "../lib/move.ts"
import type { BoardPaths } from "../lib/root.ts"
import { createTask, editTask, loadBoard, saveTask, writeTask } from "../lib/store.ts"
import { basename } from "../lib/text.ts"
import { DEFAULT_THEME, THEMES, type ThemeName } from "../lib/themes.ts"
import { LANES, type Config, type Lane, type Task } from "../lib/types.ts"
import { watchTasks } from "../lib/watch.ts"
import { useAgentStatuses } from "./agent-status.ts"
import { Board } from "./components/board.tsx"
import { defaultFormValues, descriptionFromBody, TaskForm, type FormValues } from "./components/form.tsx"
import { HelpOverlay, PreviewOverlay, TooSmall } from "./components/overlays.tsx"
import { SettingsForm, type SettingsValues } from "./components/settings.tsx"
import type { ToastInfo, ToastKind } from "./components/toast.tsx"
import { ThemeProvider, tuiColor } from "./theme.ts"

type Screen = "board" | "form" | "preview" | "help" | "settings"

type AppProps = {
  paths: BoardPaths
  cwd: string
  initialConfig: Config
  initialTasks: Task[]
}

function tasksInLane(tasks: Task[], lane: Lane): Task[] {
  return tasks.filter((task) => task.status === lane)
}

function adjacentLane(lane: Lane, dir: number): Lane {
  const idx = LANES.indexOf(lane)
  const next = Math.min(LANES.length - 1, Math.max(0, idx + dir))
  return LANES[next] ?? lane
}

function withoutId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids)
  next.delete(id)
  return next
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
  const [toast, setToast] = useState<ToastInfo | null>(null)
  const [launchingIds, setLaunchingIds] = useState<Set<string>>(() => new Set())
  const dragId = useRef<string | null>(null)
  const closingRef = useRef(false)
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

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
  const agentStatuses = useAgentStatuses(screen === "board" && !tooSmall, config.herdr_bin, tasks)
  const activeTheme = previewTheme ?? config.theme ?? DEFAULT_THEME
  const palette = THEMES[activeTheme] ?? THEMES[DEFAULT_THEME]

  const focusInLane = useCallback(
    (lane: Lane, id: string | null) => {
      setFocusedLane(lane)
      const list = tasksInLane(tasksRef.current, lane)
      if (id && list.some((task) => task.id === id)) {
        setFocusedId(id)
        return
      }
      setFocusedId(list[0]?.id ?? null)
    },
    [],
  )

  const moveFocused = useCallback(
    (dir: -1 | 1) => {
      const list = tasksInLane(tasksRef.current, focusedLane)
      if (list.length === 0) return
      const idx = list.findIndex((task) => task.id === focusedId)
      const next = list[Math.min(list.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir))]
      if (next) setFocusedId(next.id)
    },
    [focusedLane, focusedId],
  )

  const applyMove = useCallback(
    async (id: string, lane: Lane) => {
      const current = tasksRef.current.find((task) => task.id === id)
      if (!current) return
      if (current.status === lane && lane !== "in_progress") return
      const previous = current
      try {
        if (lane === "in_progress") {
          const pending = await moveTask(props.paths, id, lane, { launch: false })
          setTasks((all) => all.map((task) => (task.id === id ? pending : task)))
          if (pending.herdr.pane_id) {
            showToast(`${id} in_progress`)
            focusInLane(lane, id)
            setSelectedId(null)
            return
          }
          setLaunchingIds((set) => new Set(set).add(id))
          showToast(`${id} starting…`)
          void completeInProgressLaunch(props.paths, pending)
            .then((result) => {
              setTasks((all) => all.map((task) => (task.id === id ? result.task : task)))
              showToast(
                result.warning ?? `${id} in_progress`,
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
    [focusInLane, props.paths, showToast],
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
    if (task.status !== "in_progress") {
      showToast(`${task.id} is not in progress.`, "error")
      return
    }
    void focusTaskLayout({
      bin: config.herdr_bin,
      task,
      behavior: config.herdr_behavior,
    })
      .then((result) => showToast(`focused ${result.noun} ${result.id}`))
      .catch((err) => showToast(err instanceof Error ? err.message : String(err), "error"))
  }, [config.herdr_behavior, config.herdr_bin, focusedId, showToast])

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
      bin: config.herdr_bin,
      task,
      behavior: config.herdr_behavior,
    })
      .then(async (result) => {
        const latest = tasksRef.current.find((item) => item.id === task.id) ?? task
        const cleared = {
          ...latest,
          herdr: { workspace_id: null, pane_id: null, agent_name: null },
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
  }, [config.herdr_behavior, config.herdr_bin, focusedId, showToast])

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
      blockers: task.blockers,
    })
    setFormError(null)
    setScreen("form")
  }, [focusedId, showToast])

  const submitForm = useCallback(
    async (values: FormValues) => {
      const title = values.title.trim()
      if (!title) {
        setFormError("Title is required.")
        return
      }
      if (values.type && !config.task_types.includes(values.type)) {
        setFormError(`Unknown type '${values.type}'. Known: ${config.task_types.join(", ")}`)
        return
      }
      if (!config.agents[values.agent]) {
        setFormError(`Unknown agent '${values.agent}'. Known: ${agentKeys(config).join(", ")}`)
        return
      }
      if (!(await isDirectory(values.project.trim()))) {
        setFormError(`Project path does not exist: ${values.project}`)
        return
      }
      try {
        if (formMode === "create") {
          const task = await createTask(props.paths, {
            title,
            description: values.description,
            type: values.type,
            agent: values.agent,
            effort: values.effort,
            project: values.project.trim(),
            blockers: values.blockers,
          })
          setTasks((all) => [...all, task])
          focusInLane(task.status, task.id)
          showToast(`created ${task.id}`)
        } else if (editingId) {
          const task = await editTask(props.paths, editingId, {
            title,
            description: values.description,
            type: values.type,
            agent: values.agent,
            effort: values.effort,
            project: values.project.trim(),
            blockers: values.blockers,
          })
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
    [config, editingId, focusInLane, formMode, props.paths, showToast],
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
      if (!config.agents[values.default_agent]) {
        setSettingsError(
          `Unknown agent '${values.default_agent}'. Known: ${agentKeys(config).join(", ")}`,
        )
        return
      }
      const project = values.default_project.trim()
      if (project && !(await isDirectory(project))) {
        setSettingsError(`Project path does not exist: ${project}`)
        return
      }
      if (!values.herdr_bin.trim()) {
        setSettingsError("herdr_bin cannot be empty.")
        return
      }
      try {
        const next = await applySettings(props.paths, {
          ...values,
          default_project: project,
          herdr_bin: values.herdr_bin.trim(),
        })
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
    [config, props.paths, showToast],
  )

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy()
      return
    }
    if (key.name === "q" && screen !== "form" && screen !== "settings") {
      renderer.destroy()
      return
    }
    if (tooSmall) return
    if (screen !== "board") return

    if (key.name === "escape") {
      setSelectedId(null)
      setToast(null)
      return
    }
    if (key.name === "space") {
      if (!focusedId) return
      setSelectedId((id) => (id === focusedId ? null : focusedId))
      return
    }
    if (key.name === "j" || key.name === "down") {
      key.preventDefault?.()
      moveFocused(1)
      return
    }
    if (key.name === "k" || key.name === "up") {
      key.preventDefault?.()
      moveFocused(-1)
      return
    }
    if (key.name === "h" || key.name === "left" || key.name === "l" || key.name === "right") {
      const dir = key.name === "h" || key.name === "left" ? -1 : 1
      const targetId = selectedId ?? focusedId
      const target = tasksRef.current.find((task) => task.id === targetId)
      if (selectedId && target) {
        void applyMove(target.id, adjacentLane(target.status, dir))
        return
      }
      const nextLane = adjacentLane(focusedLane, dir)
      focusInLane(nextLane, focusedId)
      return
    }
    if (key.name === "c" && !key.ctrl && !key.meta) {
      const task = tasksRef.current.find((item) => item.id === focusedId)
      if (task?.status === "done" && hasHerdrLayout(task)) {
        key.preventDefault?.()
        closeHerdr()
        return
      }
    }
    if (key.name === "n" || key.name === "c") {
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
          onFocusTask={onFocusTask}
          onDrop={onDrop}
          toast={toast}
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
