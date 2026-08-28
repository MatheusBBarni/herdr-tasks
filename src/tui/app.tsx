import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { agentKeys } from "../lib/agents.ts"
import { CliError } from "../lib/errors.ts"
import { isDirectory } from "../lib/fs.ts"
import { completeInProgressLaunch, moveTask } from "../lib/move.ts"
import type { BoardPaths } from "../lib/root.ts"
import { createTask, editTask, loadBoard, writeTask } from "../lib/store.ts"
import { LANES, type Config, type Lane, type Task } from "../lib/types.ts"
import { watchTasks } from "../lib/watch.ts"
import { Board } from "./components/board.tsx"
import { defaultFormValues, descriptionFromBody, TaskForm, type FormValues } from "./components/form.tsx"
import { HelpOverlay, PreviewOverlay, TooSmall } from "./components/overlays.tsx"
import type { ToastInfo, ToastKind } from "./components/toast.tsx"
import { theme, tuiColor } from "./theme.ts"

type Screen = "board" | "form" | "preview" | "help"

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focusedLane, setFocusedLane] = useState<Lane>("backlog")
  const [focusedId, setFocusedId] = useState<string | null>(props.initialTasks[0]?.id ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastInfo | null>(null)
  const [launchingIds, setLaunchingIds] = useState<Set<string>>(() => new Set())
  const dragId = useRef<string | null>(null)
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
          setLaunchingIds((set) => new Set(set).add(id))
          showToast(`${id} starting…`)
          const pending = await moveTask(props.paths, id, lane, { launch: false })
          setTasks((all) => all.map((task) => (task.id === id ? pending : task)))
          if (pending.herdr.pane_id) {
            setLaunchingIds((set) => {
              const next = new Set(set)
              next.delete(id)
              return next
            })
            showToast(`${id} in_progress`)
            focusInLane(lane, id)
            setSelectedId(null)
            return
          }
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
              setLaunchingIds((set) => {
                const next = new Set(set)
                next.delete(id)
                return next
              })
            })
        } else {
          const updated = await moveTask(props.paths, id, lane)
          setTasks((all) => all.map((task) => (task.id === id ? updated : task)))
          showToast(`${id} ${updated.status}`)
        }
        focusInLane(lane, id)
        setSelectedId(null)
      } catch (err) {
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

  const openEdit = useCallback(() => {
    const task = tasksRef.current.find((item) => item.id === focusedId)
    if (!task) {
      showToast("No task focused.", "error")
      return
    }
    setFormMode("edit")
    setEditingId(task.id)
    setFormInitial({
      title: task.title,
      description: descriptionFromBody(task.title, task.body),
      agent: task.agent,
      project: task.project,
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
            agent: values.agent,
            project: values.project.trim(),
          })
          setTasks((all) => [...all, task])
          focusInLane(task.status, task.id)
          showToast(`created ${task.id}`)
        } else if (editingId) {
          const task = await editTask(props.paths, editingId, {
            title,
            description: values.description,
            agent: values.agent,
            project: values.project.trim(),
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

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy()
      return
    }
    if (key.name === "q" && screen !== "form") {
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
      moveFocused(1)
      return
    }
    if (key.name === "k" || key.name === "up") {
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

  if (tooSmall) {
    return (
      <box width="100%" height="100%" backgroundColor={color ? theme.bg : undefined}>
        <TooSmall width={width} height={height} />
      </box>
    )
  }

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={color ? theme.bg : undefined}
    >
      {screen === "form" ? (
        <TaskForm
          mode={formMode}
          initial={formInitial}
          agentKeys={agentKeys(config)}
          error={formError}
          onSubmit={(values) => void submitForm(values)}
          onCancel={() => setScreen("board")}
        />
      ) : screen === "help" ? (
        <HelpOverlay onClose={() => setScreen("board")} />
      ) : screen === "preview" && previewTask ? (
        <PreviewOverlay task={previewTask} onClose={() => setScreen("board")} />
      ) : (
        <Board
          tasks={tasks}
          width={width}
          singlePane={singlePane}
          focusedLane={focusedLane}
          focusedId={focusedId}
          selectedId={selectedId}
          launchingIds={launchingIds}
          onFocusTask={onFocusTask}
          onDrop={onDrop}
          toast={toast}
        />
      )}
    </box>
  )
}
