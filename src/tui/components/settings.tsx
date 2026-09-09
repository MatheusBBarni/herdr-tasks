import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { THEME_NAMES, type ThemeName } from "../../lib/themes.ts"
import { HERDR_BEHAVIORS, type HerdrBehavior } from "../../lib/types.ts"
import { useArmed } from "../arm.ts"
import { tuiColor, useTheme } from "../theme.ts"
import { CompactSelect, DialogOverlay, fieldInputColors } from "./form-kit.tsx"

export type SettingsValues = {
  theme: ThemeName
  default_agent: string
  default_project: string
  herdr_behavior: HerdrBehavior
  herdr_bin: string
}

type FieldName = "theme" | "default_agent" | "herdr_behavior" | "default_project" | "herdr_bin"

type SettingsFormProps = {
  initial: SettingsValues
  agentKeys: string[]
  error: string | null
  onPreviewTheme: (name: ThemeName) => void
  onSubmit: (values: SettingsValues) => void
  onCancel: () => void
}

const FIELDS = [
  "theme",
  "default_agent",
  "herdr_behavior",
  "herdr_bin",
  "default_project",
] as const

export function settingsLayout(width: number): {
  dialogWidth: number
  stackFields: boolean
} {
  return {
    stackFields: width < 70,
    dialogWidth: Math.min(72, Math.max(36, width - 8)),
  }
}

export function classifySettingsError(
  message: string | null,
): Partial<Record<FieldName | "form", string>> {
  if (!message) return {}
  const lower = message.toLowerCase()
  if (lower.includes("theme")) return { theme: message }
  if (lower.includes("agent")) return { default_agent: message }
  if (lower.includes("behavior")) return { herdr_behavior: message }
  if (lower.includes("project") || lower.includes("path")) return { default_project: message }
  if (lower.includes("herdr_bin") || lower.includes("bin")) return { herdr_bin: message }
  return { form: message }
}

function SettingsField(props: {
  title: string
  focused: boolean
  error?: string
  color: boolean
  onMouseDown?: () => void
  children: ReactNode
}) {
  const theme = useTheme()
  const titleColor = props.color ? (props.focused ? theme.focus : theme.muted) : undefined
  const borderColor = props.color ? (props.focused ? theme.focus : theme.border) : undefined
  return (
    <box flexDirection="column" flexShrink={0} width="100%" onMouseDown={props.onMouseDown}>
      <box
        border
        borderStyle={props.focused ? "double" : "single"}
        borderColor={borderColor}
        title={props.title}
        titleColor={titleColor}
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

function FooterHints(props: { color: boolean }) {
  const theme = useTheme()
  if (!props.color) {
    return <text>tab next   ^enter save   esc cancel</text>
  }
  return (
    <text fg={theme.muted}>
      <span fg={theme.fg}>tab</span> next   <span fg={theme.fg}>^enter</span> save   <span fg={theme.fg}>esc</span> cancel
    </text>
  )
}

export function SettingsForm(props: SettingsFormProps) {
  const color = tuiColor()
  const theme = useTheme()
  const { width } = useTerminalDimensions()
  const { dialogWidth, stackFields } = settingsLayout(width)
  const armed = useArmed()
  const [focus, setFocus] = useState(0)
  const [themeName, setThemeName] = useState<ThemeName>(props.initial.theme)
  const [agent, setAgent] = useState(props.initial.default_agent)
  const [behavior, setBehavior] = useState<HerdrBehavior>(props.initial.herdr_behavior)
  const [project, setProject] = useState(props.initial.default_project)
  const [bin, setBin] = useState(props.initial.herdr_bin)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName | "form", string>>>(() =>
    classifySettingsError(props.error),
  )
  const submitted = useRef(false)
  const themeRef = useRef(themeName)
  const agentRef = useRef(agent)
  const behaviorRef = useRef(behavior)
  const projectRef = useRef(project)
  const binRef = useRef(bin)
  themeRef.current = themeName
  agentRef.current = agent
  behaviorRef.current = behavior
  projectRef.current = project
  binRef.current = bin

  const themeOptions = useMemo(
    () => THEME_NAMES.map((name) => ({ name, description: "", value: name })),
    [],
  )
  const agentOptions = useMemo(
    () => props.agentKeys.map((key) => ({ name: key, description: "", value: key })),
    [props.agentKeys],
  )
  const behaviorOptions = useMemo(
    () => HERDR_BEHAVIORS.map((name) => ({ name, description: "", value: name })),
    [],
  )
  const themeIndex = Math.max(0, THEME_NAMES.indexOf(themeName))
  const agentIndex = Math.max(0, props.agentKeys.indexOf(agent))
  const behaviorIndex = Math.max(0, HERDR_BEHAVIORS.indexOf(behavior))

  useEffect(() => {
    submitted.current = false
    setFieldErrors(classifySettingsError(props.error))
  }, [props.error])

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
    const nextTheme = themeRef.current
    const nextAgent = agentRef.current
    const nextBehavior = behaviorRef.current
    const nextBin = binRef.current
    const errors: Partial<Record<FieldName | "form", string>> = {}
    if (props.agentKeys.length > 0 && !props.agentKeys.includes(nextAgent)) {
      errors.default_agent = `Unknown agent '${nextAgent}'. Known: ${props.agentKeys.join(", ")}`
    }
    if (!nextBin.trim()) errors.herdr_bin = "herdr_bin cannot be empty."
    if (Object.keys(errors).length > 0) {
      submitted.current = false
      setFieldErrors(errors)
      return
    }
    props.onSubmit({
      theme: nextTheme,
      default_agent: nextAgent,
      default_project: projectRef.current,
      herdr_behavior: nextBehavior,
      herdr_bin: nextBin,
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
      key.preventDefault?.()
      submitNow()
    }
  })

  const inputColors = fieldInputColors(theme, color)
  const pairWidth = stackFields ? "100%" : "50%"

  return (
    <DialogOverlay title="Settings" width={dialogWidth} color={color}>
      <box
        flexDirection={stackFields ? "column" : "row"}
        gap={stackFields ? 0 : 1}
        flexShrink={0}
        width="100%"
      >
        <box width={pairWidth} flexGrow={1} flexShrink={1}>
          <SettingsField
            title="theme"
            focused={focus === 0}
            error={fieldErrors.theme}
            color={color}
            onMouseDown={() => setFocus(0)}
          >
            <CompactSelect
              options={themeOptions}
              selectedIndex={themeIndex}
              focused={focus === 0}
              color={color}
              onChange={(_index, value) => {
                if (!(THEME_NAMES as readonly string[]).includes(value)) return
                const next = value as ThemeName
                if (next === themeRef.current) return
                themeRef.current = next
                setThemeName(next)
                props.onPreviewTheme(next)
                clearError("theme")
              }}
            />
          </SettingsField>
        </box>
        <box width={pairWidth} flexGrow={1} flexShrink={1}>
          <SettingsField
            title="default agent"
            focused={focus === 1}
            error={fieldErrors.default_agent}
            color={color}
            onMouseDown={() => setFocus(1)}
          >
            {props.agentKeys.length === 0 ? (
              <text fg={color ? theme.muted : undefined}>none</text>
            ) : (
              <CompactSelect
                options={agentOptions}
                selectedIndex={agentIndex}
                focused={focus === 1}
                color={color}
                onChange={(_index, value) => {
                  agentRef.current = value
                  setAgent(value)
                  clearError("default_agent")
                }}
              />
            )}
          </SettingsField>
        </box>
      </box>

      <box
        flexDirection={stackFields ? "column" : "row"}
        gap={stackFields ? 0 : 1}
        flexShrink={0}
        width="100%"
      >
        <box width={pairWidth} flexGrow={1} flexShrink={1}>
          <SettingsField
            title="herdr behavior"
            focused={focus === 2}
            error={fieldErrors.herdr_behavior}
            color={color}
            onMouseDown={() => setFocus(2)}
          >
            <CompactSelect
              options={behaviorOptions}
              selectedIndex={behaviorIndex}
              focused={focus === 2}
              color={color}
              onChange={(_index, value) => {
                if (!(HERDR_BEHAVIORS as readonly string[]).includes(value)) return
                const next = value as HerdrBehavior
                behaviorRef.current = next
                setBehavior(next)
                clearError("herdr_behavior")
              }}
            />
          </SettingsField>
        </box>
        <box width={pairWidth} flexGrow={1} flexShrink={1}>
          <SettingsField
            title="herdr bin"
            focused={focus === 3}
            error={fieldErrors.herdr_bin}
            color={color}
            onMouseDown={() => setFocus(3)}
          >
            <input
              value={bin}
              onInput={(value) => {
                binRef.current = value
                setBin(value)
                clearError("herdr_bin")
              }}
              focused={focus === 3}
              width="100%"
              placeholder="herdr"
              {...inputColors}
            />
          </SettingsField>
        </box>
      </box>

      <SettingsField
        title="default project"
        focused={focus === 4}
        error={fieldErrors.default_project}
        color={color}
        onMouseDown={() => setFocus(4)}
      >
        <input
          value={project}
          onInput={(value) => {
            projectRef.current = value
            setProject(value)
            clearError("default_project")
          }}
          focused={focus === 4}
          width="100%"
          placeholder="empty = cwd"
          {...inputColors}
        />
      </SettingsField>

      {fieldErrors.form ? (
        <text fg={color ? theme.error : undefined}>{fieldErrors.form}</text>
      ) : null}
      <box marginTop={1} flexShrink={0}>
        <FooterHints color={color} />
      </box>
    </DialogOverlay>
  )
}
