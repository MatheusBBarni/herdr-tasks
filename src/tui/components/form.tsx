import { useEffect, useRef, useState } from "react"
import type { TextareaRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import type { Config } from "../../lib/types.ts"
import { theme, tuiColor } from "../theme.ts"

export type FormValues = {
  title: string
  description: string
  agent: string
  project: string
}

type TaskFormProps = {
  mode: "create" | "edit"
  initial: FormValues
  agentKeys: string[]
  error: string | null
  onSubmit: (values: FormValues) => void
  onCancel: () => void
}

const FIELDS = ["title", "description", "agent", "project"] as const

export function TaskForm(props: TaskFormProps) {
  const color = tuiColor()
  const [armed, setArmed] = useState(false)
  const [focus, setFocus] = useState(0)
  const [title, setTitle] = useState(props.initial.title)
  const [description, setDescription] = useState(props.initial.description)
  const [agent, setAgent] = useState(props.initial.agent)
  const [project, setProject] = useState(props.initial.project)
  const submitted = useRef(false)
  const titleRef = useRef(title)
  const agentRef = useRef(agent)
  const projectRef = useRef(project)
  const descRef = useRef<TextareaRenderable>(null)
  titleRef.current = title
  agentRef.current = agent
  projectRef.current = project

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    submitted.current = false
  }, [props.error])

  const readDescription = () => descRef.current?.plainText ?? description

  const submitNow = () => {
    if (submitted.current) return
    submitted.current = true
    props.onSubmit({
      title: titleRef.current,
      description: readDescription(),
      agent: agentRef.current,
      project: projectRef.current,
    })
  }

  const cycleAgent = (dir: number) => {
    if (props.agentKeys.length === 0) return
    const idx = Math.max(0, props.agentKeys.indexOf(agentRef.current))
    const next = (idx + dir + props.agentKeys.length) % props.agentKeys.length
    const key = props.agentKeys[next]
    if (key) setAgent(key)
  }

  useKeyboard((key) => {
    if (!armed) return
    if (key.name === "escape") {
      key.preventDefault?.()
      props.onCancel()
      return
    }
    if (key.name === "tab") {
      key.preventDefault?.()
      const dir = key.shift ? -1 : 1
      setFocus((i) => (i + dir + FIELDS.length) % FIELDS.length)
      return
    }
    if (FIELDS[focus] === "agent" && (key.name === "left" || key.name === "h")) {
      cycleAgent(-1)
      return
    }
    if (FIELDS[focus] === "agent" && (key.name === "right" || key.name === "l")) {
      cycleAgent(1)
      return
    }
    if ((key.ctrl || key.meta) && (key.name === "enter" || key.name === "return")) {
      key.preventDefault?.()
      submitNow()
      return
    }
    if (key.name === "enter" || key.name === "return") {
      if (FIELDS[focus] === "description") return
      key.preventDefault?.()
      submitNow()
    }
  })

  const heading = props.mode === "create" ? "New task" : "Edit task"
  const label = (name: string, index: number) => `${focus === index ? ">" : " "} ${name}`

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      border
      borderColor={color ? theme.focus : undefined}
      title={heading}
      padding={1}
    >
      <text fg={color ? theme.muted : undefined}>
        Tab fields  Enter save  newline in description  Ctrl+Enter save  Esc cancel
      </text>
      <text>{label("title", 0)}</text>
      <input
        value={title}
        onChange={setTitle}
        focused={focus === 0}
        width="100%"
        placeholder="required"
      />
      <text>{label("description", 1)}</text>
      <textarea
        ref={descRef}
        initialValue={props.initial.description}
        focused={focus === 1}
        width="100%"
        height={6}
        flexGrow={1}
        wrapMode="word"
        placeholder="optional — Enter for newline"
        onContentChange={() => {
          setDescription(descRef.current?.plainText ?? "")
        }}
        onSubmit={submitNow}
      />
      <text>{label("agent", 2)}</text>
      <text fg={color ? theme.focus : undefined}>
        {`  ${agent}  (${props.agentKeys.join(", ") || "none"})`}
      </text>
      <text>{label("project", 3)}</text>
      <input
        value={project}
        onChange={setProject}
        focused={focus === 3}
        width="100%"
        placeholder="path"
      />
      {props.error ? (
        <text fg={color ? theme.error : undefined}>{props.error}</text>
      ) : (
        <text> </text>
      )}
    </box>
  )
}

export function defaultFormValues(config: Config, cwd: string): FormValues {
  return {
    title: "",
    description: "",
    agent: config.agents[config.default_agent]
      ? config.default_agent
      : (Object.keys(config.agents)[0] ?? ""),
    project: config.default_project || cwd,
  }
}

export function descriptionFromBody(title: string, body: string): string {
  const heading = `# ${title}`
  const rest = body.startsWith(heading) ? body.slice(heading.length) : body.replace(/^# [^\n]+/, "")
  return rest.replace(/^\n+/, "").replace(/\n+$/, "")
}
