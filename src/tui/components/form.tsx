import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { TextareaRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { basename } from "node:path"
import { toggleBlocker } from "../../lib/blockers.ts"
import { EFFORTS, isEffort } from "../../lib/effort.ts"
import { defaultProjectPath } from "../../lib/projects.ts"
import { truncateCells } from "../../lib/text.ts"
import type { Config } from "../../lib/types.ts"
import { useArmed } from "../arm.ts"
import { tuiColor, useTheme } from "../theme.ts"
import { CompactSelect, DialogOverlay, fieldInputColors, noneSelectValue } from "./form-kit.tsx"

export type FormValues = {
  title: string
  description: string
  type: string
  agent: string
  effort: string
  project: string
  worktree: boolean
  blockers: string[]
}

export type BlockerOption = {
  id: string
  title: string
}

export type ProjectOption = {
  key: string
  name: string
  path: string
}

type FieldName = "title" | "description" | "type" | "effort" | "agent" | "project" | "worktree" | "blockers"

type TaskFormProps = {
  mode: "create" | "edit"
  taskId?: string | null
  initial: FormValues
  typeKeys: string[]
  agentKeys: string[]
  projectOptions?: ProjectOption[]
  blockerTasks?: BlockerOption[]
  error: string | null
  onSubmit: (values: FormValues) => void
  onCancel: () => void
}

const FIELDS = ["title", "description", "type", "effort", "agent", "project", "worktree", "blockers"] as const

const NONE_BLOCKER_OPTION = { name: "none", description: "", value: "" }

const NONE_TYPE_OPTION = { name: "none", description: "", value: "" }

const NONE_EFFORT_OPTION = { name: "none", description: "", value: "" }

const WORKTREE_OPTIONS = [
  { name: "No", description: "", value: "no" },
  { name: "Yes", description: "", value: "yes" },
]

const EFFORT_OPTIONS = [
  NONE_EFFORT_OPTION,
  ...EFFORTS.map((key) => ({ name: key, description: "", value: key })),
]

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
    4 + // type/agent/project label + bordered row
    3 + // blockers label + bordered select
    (stackFields ? 8 : 0) +
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
  if (lower.includes("type")) return { type: message }
  if (lower.includes("effort")) return { effort: message }
  if (lower.includes("agent")) return { agent: message }
  if (lower.includes("block")) return { blockers: message }
  if (lower.includes("worktree")) return { worktree: message }
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
  showToggle: boolean
  onNext: () => void
  onToggle: () => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <box flexDirection="row" gap={1} flexShrink={0}>
      <FooterAction color={props.color} keyLabel="tab" action="next" onActivate={props.onNext} />
      {props.showToggle ? (
        <FooterAction color={props.color} keyLabel="enter" action="toggle" onActivate={props.onToggle} />
      ) : null}
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
  const armed = useArmed()
  const [focus, setFocus] = useState(0)
  const [title, setTitle] = useState(props.initial.title)
  const [description, setDescription] = useState(props.initial.description)
  const [type, setType] = useState(props.initial.type)
  const [effort, setEffort] = useState(props.initial.effort)
  const [agent, setAgent] = useState(props.initial.agent)
  const [project, setProject] = useState(
    props.initial.project || props.projectOptions?.[0]?.path || "",
  )
  const [worktree, setWorktree] = useState(props.initial.worktree)
  const [blockers, setBlockers] = useState(props.initial.blockers)
  const [blockerIndex, setBlockerIndex] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName | "form", string>>>(() =>
    classifyFormError(props.error),
  )
  const submitted = useRef(false)
  const titleRef = useRef(title)
  const typeRef = useRef(type)
  const effortRef = useRef(effort)
  const agentRef = useRef(agent)
  const projectRef = useRef(project)
  const worktreeRef = useRef(worktree)
  const blockersRef = useRef(blockers)
  const descRef = useRef<TextareaRenderable>(null)
  titleRef.current = title
  typeRef.current = type
  effortRef.current = effort
  agentRef.current = agent
  projectRef.current = project
  worktreeRef.current = worktree
  blockersRef.current = blockers
  const blockerTasks = props.blockerTasks ?? []

  const typeOptions = useMemo(
    () => [
      NONE_TYPE_OPTION,
      ...props.typeKeys.map((key) => ({ name: key, description: "", value: key })),
    ],
    [props.typeKeys],
  )
  const typeIndex =
    type && props.typeKeys.includes(type) ? props.typeKeys.indexOf(type) + 1 : 0
  const effortIndex = isEffort(effort) ? EFFORTS.indexOf(effort) + 1 : 0
  const agentOptions = useMemo(
    () => props.agentKeys.map((key) => ({ name: key, description: "", value: key })),
    [props.agentKeys],
  )
  const agentIndex = Math.max(0, props.agentKeys.indexOf(agent))
  const listedProjects = props.projectOptions ?? []
  const useProjectSelect = listedProjects.length > 0
  const projectSelectOptions = useMemo(() => {
    const listed = props.projectOptions ?? []
    if (listed.length === 0) return []
    const extra =
      props.initial.project && !listed.some((item) => item.path === props.initial.project)
        ? [
            {
              key: "",
              name: basename(props.initial.project) || props.initial.project,
              path: props.initial.project,
            },
          ]
        : []
    return [...listed, ...extra].map((item) => ({
      name: item.name,
      description: "",
      value: item.path,
    }))
  }, [props.projectOptions, props.initial.project])
  const projectIndex = Math.max(
    0,
    projectSelectOptions.findIndex((option) => option.value === project),
  )
  const blockerOptions = useMemo(() => {
    const known = new Set(blockerTasks.map((task) => task.id))
    const extras = blockers.filter((id) => !known.has(id)).map((id) => ({ id, title: "(missing)" }))
    return [
      NONE_BLOCKER_OPTION,
      ...[...blockerTasks, ...extras].map((task) => ({
        name: `${blockers.includes(task.id) ? "* " : "  "}${task.id}  ${task.title}`,
        description: "",
        value: task.id,
      })),
    ]
  }, [blockerTasks, blockers])

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

  const applyBlockerOption = (value: string) => {
    const next = toggleBlocker(blockersRef.current, value)
    blockersRef.current = next
    setBlockers(next)
    clearError("blockers")
  }

  const submitNow = () => {
    if (submitted.current) return
    submitted.current = true
    const nextTitle = titleRef.current
    const nextType = typeRef.current
    const nextEffort = effortRef.current
    const nextAgent = agentRef.current
    const nextProject = projectRef.current
    const nextWorktree = worktreeRef.current
    const nextBlockers = blockersRef.current
    const errors: Partial<Record<FieldName | "form", string>> = {}
    if (!nextTitle.trim()) errors.title = "Title is required."
    if (nextType && props.typeKeys.length > 0 && !props.typeKeys.includes(nextType)) {
      errors.type = `Unknown type '${nextType}'. Known: ${props.typeKeys.join(", ")}`
    }
    if (nextEffort && !isEffort(nextEffort)) {
      errors.effort = `Unknown effort '${nextEffort}'. Known: ${EFFORTS.join(", ")}.`
    }
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
      type: nextType,
      agent: nextAgent,
      effort: nextEffort,
      project: nextProject,
      worktree: nextWorktree,
      blockers: nextBlockers,
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
      if (FIELDS[focus] === "description" || FIELDS[focus] === "blockers") return
      key.preventDefault?.()
      submitNow()
    }
  })

  const heading = props.mode === "create" ? "New task" : `Edit ${props.taskId ?? "task"}`
  const inputColors = fieldInputColors(theme, color)

  return (
    <DialogOverlay title={heading} width={dialogWidth} color={color}>
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
          placeholder="optional, images as links"
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
        <box
          flexDirection="row"
          gap={2}
          width={stackFields ? "100%" : 28}
          flexShrink={0}
        >
          <box width={stackFields ? "50%" : 14} flexShrink={0}>
            <FormField
              label="type"
              focused={focus === 2}
              error={fieldErrors.type}
              color={color}
              onMouseDown={() => setFocus(2)}
            >
              <CompactSelect
                options={typeOptions}
                selectedIndex={typeIndex}
                focused={focus === 2}
                color={color}
                onChange={(_index, value) => {
                  const next = noneSelectValue(value)
                  typeRef.current = next
                  setType(next)
                  clearError("type")
                }}
              />
            </FormField>
          </box>
          <box width={stackFields ? "50%" : 12} flexShrink={0}>
            <FormField
              label="effort"
              focused={focus === 3}
              error={fieldErrors.effort}
              color={color}
              onMouseDown={() => setFocus(3)}
            >
              <CompactSelect
                options={EFFORT_OPTIONS}
                selectedIndex={effortIndex}
                focused={focus === 3}
                color={color}
                onChange={(_index, value) => {
                  const next = noneSelectValue(value)
                  effortRef.current = next
                  setEffort(next)
                  clearError("effort")
                }}
              />
            </FormField>
          </box>
        </box>
        <box width={stackFields ? "100%" : 16} flexShrink={0}>
          <FormField
            label="agent"
            focused={focus === 4}
            error={fieldErrors.agent}
            color={color}
            onMouseDown={() => setFocus(4)}
          >
            {props.agentKeys.length === 0 ? (
              <text fg={color ? theme.muted : undefined}>none</text>
            ) : (
              <CompactSelect
                options={agentOptions}
                selectedIndex={agentIndex}
                focused={focus === 4}
                color={color}
                onChange={(_index, value) => {
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
            focused={focus === 5}
            error={fieldErrors.project}
            color={color}
            onMouseDown={() => setFocus(5)}
          >
            {useProjectSelect ? (
              <CompactSelect
                options={projectSelectOptions}
                selectedIndex={projectIndex}
                focused={focus === 5}
                color={color}
                onChange={(_index, value) => {
                  projectRef.current = value
                  setProject(value)
                  clearError("project")
                }}
              />
            ) : (
              <input
                value={project}
                onChange={(value) => {
                  projectRef.current = value
                  setProject(value)
                  clearError("project")
                }}
                focused={focus === 5}
                width="100%"
                placeholder="path"
                {...inputColors}
              />
            )}
          </FormField>
        </box>
      </box>

      <box flexDirection="row" gap={2} flexShrink={0} width="100%">
        <box width={14} flexShrink={0}>
          <FormField
            label="worktree"
            focused={focus === 6}
            error={fieldErrors.worktree}
            color={color}
            onMouseDown={() => setFocus(6)}
          >
            <CompactSelect
              options={WORKTREE_OPTIONS}
              selectedIndex={worktree ? 1 : 0}
              focused={focus === 6}
              color={color}
              onChange={(_index, value) => {
                const next = value.toLowerCase() === "yes"
                worktreeRef.current = next
                setWorktree(next)
                clearError("worktree")
              }}
            />
          </FormField>
        </box>
        <box flexGrow={1} flexShrink={1}>
          <FormField
            label={truncateCells(
              blockers.length > 0 ? `blockers  ${blockers.join(", ")}` : "blockers",
              Math.max(8, dialogWidth - 18),
            )}
            focused={focus === 7}
            error={fieldErrors.blockers}
            color={color}
            onMouseDown={() => setFocus(7)}
          >
            <CompactSelect
              options={blockerOptions}
              selectedIndex={blockerIndex}
              focused={focus === 7}
              color={color}
              onChange={(index) => {
                setBlockerIndex(index)
              }}
              onSelect={(_index, value) => {
                applyBlockerOption(value)
              }}
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
          showToggle={focus === 7}
          onNext={() => setFocus((i) => (i + 1) % FIELDS.length)}
          onToggle={() => {
            const option = blockerOptions[blockerIndex]
            applyBlockerOption(option?.value ?? option?.name ?? "")
          }}
          onSave={submitNow}
          onCancel={props.onCancel}
        />
      </box>
    </DialogOverlay>
  )
}

export function defaultFormValues(config: Config, cwd: string): FormValues {
  const type =
    !config.default_type || config.task_types.includes(config.default_type)
      ? config.default_type
      : (config.task_types[0] ?? "")
  return {
    title: "",
    description: "",
    type,
    agent: config.agents[config.default_agent]
      ? config.default_agent
      : (Object.keys(config.agents)[0] ?? ""),
    effort: "",
    project: defaultProjectPath(config, cwd),
    worktree: false,
    blockers: [],
  }
}

export function descriptionFromBody(title: string, body: string): string {
  const heading = `# ${title}`
  const rest = body.startsWith(heading) ? body.slice(heading.length) : body.replace(/^# [^\n]+/, "")
  return rest.replace(/^\n+/, "").replace(/\n+$/, "")
}
