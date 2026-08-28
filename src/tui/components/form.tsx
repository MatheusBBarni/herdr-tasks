import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { TextareaRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import type { Config } from "../../lib/types.ts"
import { tuiColor, useTheme } from "../theme.ts"

export type FormValues = {
  title: string
  description: string
  agent: string
  project: string
}

type FieldName = "title" | "description" | "agent" | "project"

type TaskFormProps = {
  mode: "create" | "edit"
  taskId?: string | null
  initial: FormValues
  agentKeys: string[]
  error: string | null
  onSubmit: (values: FormValues) => void
  onCancel: () => void
}

const FIELDS = ["title", "description", "agent", "project"] as const

const AGENT_SELECT_BINDINGS = [
  { name: "left", action: "move-up" as const },
  { name: "right", action: "move-down" as const },
]

function swallowMouse() {}

export function formLayout(width: number, height: number): {
  dialogWidth: number
  stackFields: boolean
  descriptionRows: number
} {
  const stackFields = width < 70
  const dialogWidth = Math.min(80, Math.max(36, width - 8))
  const chrome =
    2 + // dialog border
    2 + // padding
    4 + // title label + bordered input
    1 + // description label
    2 + // description borders
    4 + // agent/project label + bordered row
    (stackFields ? 4 : 0) +
    1 + // footer
    1 // gap before footer
  const descriptionRows = Math.max(3, Math.min(8, height - 2 - chrome))
  return { dialogWidth, stackFields, descriptionRows }
}

export function classifyFormError(
  message: string | null,
): Partial<Record<FieldName | "form", string>> {
  if (!message) return {}
  const lower = message.toLowerCase()
  if (lower.includes("title")) return { title: message }
  if (lower.includes("agent")) return { agent: message }
  if (lower.includes("project") || lower.includes("path")) return { project: message }
  return { form: message }
}

function FormField(props: {
  label: string
  focused: boolean
  error?: string
  color: boolean
  onMouseDown?: () => void
  children: ReactNode
}) {
  const theme = useTheme()
  const labelFg = props.color ? (props.focused ? theme.focus : theme.muted) : undefined
  const borderColor = props.color ? (props.focused ? theme.focus : theme.border) : undefined
  return (
    <box flexDirection="column" flexShrink={0} width="100%" onMouseDown={props.onMouseDown}>
      <text fg={labelFg}>{props.label}</text>
      <box
        border
        borderStyle={props.focused ? "double" : "single"}
        borderColor={borderColor}
        width="100%"
        flexShrink={0}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={props.color ? theme.bg : undefined}
      >
        {props.children}
      </box>
      {props.error ? <text fg={props.color ? theme.error : undefined}>{props.error}</text> : null}
    </box>
  )
}

function FooterAction(props: {
  color: boolean
  keyLabel: string
  action: string
  onActivate: () => void
}) {
  const theme = useTheme()
  const [hover, setHover] = useState(false)
  const keyFg = props.color ? theme.fg : undefined
  const actionFg = props.color ? theme.muted : undefined
  return (
    <box
      flexShrink={0}
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={props.color && hover ? theme.selectedBg : undefined}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        props.onActivate()
      }}
    >
      <text fg={actionFg}>
        <span fg={keyFg}>{props.keyLabel}</span> {props.action}
      </text>
    </box>
  )
}

function FooterHints(props: {
  color: boolean
  onNext: () => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <box flexDirection="row" gap={1} flexShrink={0}>
      <FooterAction color={props.color} keyLabel="tab" action="next" onActivate={props.onNext} />
      <FooterAction color={props.color} keyLabel="^enter" action="save" onActivate={props.onSave} />
      <FooterAction color={props.color} keyLabel="esc" action="cancel" onActivate={props.onCancel} />
    </box>
  )
}

export function TaskForm(props: TaskFormProps) {
  const color = tuiColor()
  const theme = useTheme()
  const { width, height } = useTerminalDimensions()
  const { dialogWidth, stackFields, descriptionRows } = formLayout(width, height)
  const [armed, setArmed] = useState(false)
  const [focus, setFocus] = useState(0)
  const [title, setTitle] = useState(props.initial.title)
  const [description, setDescription] = useState(props.initial.description)
  const [agent, setAgent] = useState(props.initial.agent)
  const [project, setProject] = useState(props.initial.project)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName | "form", string>>>(() =>
    classifyFormError(props.error),
  )
  const submitted = useRef(false)
  const titleRef = useRef(title)
  const agentRef = useRef(agent)
  const projectRef = useRef(project)
  const descRef = useRef<TextareaRenderable>(null)
  titleRef.current = title
  agentRef.current = agent
  projectRef.current = project

  const agentOptions = useMemo(
    () => props.agentKeys.map((key) => ({ name: key, description: "", value: key })),
    [props.agentKeys],
  )
  const agentIndex = Math.max(0, props.agentKeys.indexOf(agent))

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    submitted.current = false
    setFieldErrors(classifyFormError(props.error))
  }, [props.error])

  const readDescription = () => descRef.current?.plainText ?? description

  const clearError = (field: FieldName) => {
    setFieldErrors((current) => {
      if (!current[field] && !current.form) return current
      const next = { ...current }
      delete next[field]
      delete next.form
      return next
    })
  }

  const submitNow = () => {
    if (submitted.current) return
    submitted.current = true
    const nextTitle = titleRef.current
    const nextAgent = agentRef.current
    const nextProject = projectRef.current
    const errors: Partial<Record<FieldName | "form", string>> = {}
    if (!nextTitle.trim()) errors.title = "Title is required."
    if (props.agentKeys.length > 0 && !props.agentKeys.includes(nextAgent)) {
      errors.agent = `Unknown agent '${nextAgent}'. Known: ${props.agentKeys.join(", ")}`
    }
    if (Object.keys(errors).length > 0) {
      submitted.current = false
      setFieldErrors(errors)
      return
    }
    props.onSubmit({
      title: nextTitle,
      description: readDescription(),
      agent: nextAgent,
      project: nextProject,
    })
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

  const heading = props.mode === "create" ? "New task" : `Edit ${props.taskId ?? "task"}`
  const inputColors = color
    ? {
        backgroundColor: theme.bg,
        textColor: theme.fg,
        focusedBackgroundColor: theme.bg,
        placeholderColor: theme.muted,
        cursorColor: theme.focus,
      }
    : {}

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      flexDirection="row"
      justifyContent="center"
      alignItems="center"
      zIndex={20}
      backgroundColor={color ? theme.overlayBg : undefined}
      onMouseDown={swallowMouse}
      onMouseUp={swallowMouse}
    >
      <box
        width={dialogWidth}
        flexDirection="column"
        flexShrink={0}
        border
        borderStyle="single"
        borderColor={color ? theme.border : undefined}
        title={heading}
        titleColor={color ? theme.focus : undefined}
        padding={1}
        backgroundColor={color ? theme.cardBg : undefined}
      >
        <FormField
          label="title"
          focused={focus === 0}
          error={fieldErrors.title}
          color={color}
          onMouseDown={() => setFocus(0)}
        >
          <input
            value={title}
            onChange={(value) => {
              titleRef.current = value
              setTitle(value)
              clearError("title")
            }}
            focused={focus === 0}
            width="100%"
            placeholder="required"
            {...inputColors}
          />
        </FormField>

        <FormField
          label="description"
          focused={focus === 1}
          error={fieldErrors.description}
          color={color}
          onMouseDown={() => setFocus(1)}
        >
          <textarea
            ref={descRef}
            initialValue={props.initial.description}
            focused={focus === 1}
            width="100%"
            height={descriptionRows}
            flexGrow={0}
            flexShrink={0}
            wrapMode="word"
            placeholder="optional"
            onContentChange={() => {
              setDescription(descRef.current?.plainText ?? "")
            }}
            {...inputColors}
          />
        </FormField>

        <box
          flexDirection={stackFields ? "column" : "row"}
          gap={stackFields ? 0 : 2}
          flexShrink={0}
          width="100%"
        >
          <box width={stackFields ? "100%" : 26} flexShrink={0}>
            <FormField
              label="agent"
              focused={focus === 2}
              error={fieldErrors.agent}
              color={color}
              onMouseDown={() => setFocus(2)}
            >
              {props.agentKeys.length === 0 ? (
                <text fg={color ? theme.muted : undefined}>none</text>
              ) : (
                <select
                  options={agentOptions}
                  selectedIndex={agentIndex}
                  focused={focus === 2}
                  width="100%"
                  height={1}
                  showDescription={false}
                  showSelectionIndicator={false}
                  wrapSelection
                  keyBindings={AGENT_SELECT_BINDINGS}
                  backgroundColor={color ? theme.bg : undefined}
                  textColor={color ? theme.fg : undefined}
                  focusedBackgroundColor={color ? theme.bg : undefined}
                  focusedTextColor={color ? theme.fg : undefined}
                  selectedBackgroundColor={color ? theme.selectedBg : undefined}
                  selectedTextColor={color ? theme.fg : undefined}
                  onChange={(_index, option) => {
                    const value = option?.value ?? option?.name
                    if (typeof value !== "string") return
                    agentRef.current = value
                    setAgent(value)
                    clearError("agent")
                  }}
                />
              )}
            </FormField>
          </box>
          <box flexGrow={1} flexShrink={1} width={stackFields ? "100%" : undefined}>
            <FormField
              label="project"
              focused={focus === 3}
              error={fieldErrors.project}
              color={color}
              onMouseDown={() => setFocus(3)}
            >
              <input
                value={project}
                onChange={(value) => {
                  projectRef.current = value
                  setProject(value)
                  clearError("project")
                }}
                focused={focus === 3}
                width="100%"
                placeholder="path"
                {...inputColors}
              />
            </FormField>
          </box>
        </box>

        {fieldErrors.form ? (
          <text fg={color ? theme.error : undefined}>{fieldErrors.form}</text>
        ) : null}
        <box marginTop={1} flexShrink={0}>
          <FooterHints
            color={color}
            onNext={() => setFocus((i) => (i + 1) % FIELDS.length)}
            onSave={submitNow}
            onCancel={props.onCancel}
          />
        </box>
      </box>
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
