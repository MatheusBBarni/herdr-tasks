# AGENTS.md

Instructions for coding agents working in this repository.

## What this is

`htasks` — a Bun Kanban task runner: OpenTUI React board + CLI. Humans and agents list, show, create, edit, and move tasks. Moving a card to In Progress starts a Herdr workspace in the task’s repo and sends the task file as the first prompt.

Product spec (read fully before implementing): [`htasks-prompt.md`](htasks-prompt.md).

This file is the agent contract. If it conflicts with a skill, **this file and `htasks-prompt.md` win** on product, naming, stack, and CLI. Skills win on library APIs.

## Naming (strict)

| Name | Meaning |
|------|---------|
| `htasks` | This project’s **only** binary (CLI + TUI). |
| `herdr` | Existing terminal multiplexer. Installed separately. Never ship a binary named `herder` or `herdr`. |
| `.herdr-tasks/` | On-disk data dir (leading dot). Not `.herder-tasks`, not `.tasks`. |

Do not name packages or bins `herder`. Do not use Rust. Do not use ACP.

## Stack (locked)

- Bun >= 1.3
- `@opentui/core` + `@opentui/react` + **React 19** (React >= 19.2)
- `jsxImportSource`: `@opentui/react`
- TOML config, markdown tasks with YAML frontmatter
- `Bun.spawn` for the `herdr` CLI; parse JSON stdout
- `package.json` bin: only `"htasks": "src/cli/htasks.ts"`
- Strict TypeScript

Do **not** use Ink, Solid, `@opentui/solid`, blessed, or a second bin.

## Installed skills

Skills live in [`.agents/skills/`](.agents/skills/). Load the skill `SKILL.md`, then only the references the task needs. Do not invent OpenTUI or Herdr APIs.

| Skill | Path | Use for | Do not use for |
|-------|------|---------|----------------|
| **opentui** | `.agents/skills/opentui/SKILL.md` | All OpenTUI implementation. Framework is **React**. Start at `references/react/REFERENCE.md`. | Solid or Core as the app API. Core is allowed only for `createCliRenderer` and documented renderer methods. |
| **tui-design** | `.agents/skills/tui-design/SKILL.md` | Product shape, CLI stdout/stderr/exit codes, layout, keys, clutter audit, 80×24 / 60-col floor. | OpenTUI or Herdr API claims. The TS ecosystem doc defaults to **Ink** — ignore that default here. |
| **opentui-design** | `.agents/skills/opentui-design/SKILL.md` | Extra OpenTUI pitfalls: key propagation, mouse capture vs OS copy, string width. | Authoritative React APIs. This skill is **Solid-oriented**. Ignore `createSignal`, `onMount`, `render` from `@opentui/solid`, and “never destructure props”. |
| **vercel-react-best-practices** | `.agents/skills/vercel-react-best-practices/SKILL.md` | React re-render and JS patterns that still apply in a TUI. | Next.js, RSC, SWR, hydration, DOM/`next/dynamic`, `after()`, resource hints, SVG/`content-visibility`. |

### Skill reading order

**TUI work**

1. `.agents/skills/opentui/references/react/REFERENCE.md`
2. Then as needed: `react/api.md`, `react/patterns.md`, `react/gotchas.md`, `react/configuration.md`
3. Layout → `opentui/references/layout/REFERENCE.md`
4. Keys → `opentui/references/keyboard/REFERENCE.md` (keymap if layered bindings)
5. Components → `opentui/references/components/` (`containers.md`, `inputs.md`, `text-display.md`)
6. UX / floor / clutter → `tui-design` `visual-patterns.md` + `interaction-patterns.md`
7. CLI subcommands (non-board) → `tui-design` `references/cli-basics.md`

**React performance (TUI-relevant only)**

- `rerender-no-inline-components`
- `rerender-derived-state` / `rerender-derived-state-no-effect`
- `rerender-functional-setstate`
- `rerender-lazy-state-init`
- `rerender-use-ref-transient-values`
- `js-index-maps`, `js-set-map-lookups`, `js-early-exit`

Skip the rest of that skill unless it clearly applies without a browser or Next.js.

## OpenTUI React contract

Authoritative APIs: the **opentui** skill. Do not invent components, hooks, or Herdr flags.

### Setup

- `tsconfig`: `"jsx": "react-jsx"`, `"jsxImportSource": "@opentui/react"`
- Entry: `createCliRenderer` from `@opentui/core`, then `createRoot(renderer).render(<App />)` from `@opentui/react`
- Host elements are **not HTML**: `<box>`, `<text>`, `<input>`, `<textarea>`, `<select>`, `<scrollbox>` — never `<div>` / `<button>`
- Text styling: nested modifier tags inside `<text>` (`<strong>`, `<em>`, `<u>`, `<span fg="…">`). Not CSS classNames. Color prop is `fg`, not `color`.
- `<span>` only works inside `<text>`

### Lifecycle

- **Never `process.exit()` from the TUI.** Quit with `renderer.destroy()` (`q` / Ctrl+C). That restores alternate screen, cursor, and raw mode.
- OpenTUI already cleans up SIGINT/SIGTERM/etc. Custom signals: `exitOnCtrlC: false` and still call `renderer.destroy()`.
- Do not print diagnostics into the live UI. Use the renderer console overlay or a file.

### Input

- Interactive widgets need an explicit `focused` prop.
- `<select>` options are `{ name, description, value }[]`. `onSelect` = Enter; `onChange` = arrow move. Do not submit on `onChange`.
- Multiple `useKeyboard` handlers all fire. Prevent default at the source; delay-arm the destination after a screen change so Enter does not double-fire. See opentui-design `input-handling.md` / `opentui-gotchas.md` (adapt Solid examples to React `useState` + `useEffect`).
- Keyboard is required for every action. Mouse may accelerate; it must not gate.
- If OpenTUI lacks drag-and-drop, implement mouse down/move/up + lane hit-testing and document it. Do not fake a non-existent DnD API.

### Layout and density

- Parent needs explicit size before `%` width or `flexGrow` work (`height="100%"` / `width="100%"`).
- Prefer direct layout props over inline `style={{…}}` objects (new object every render).
- Usable at **80×24**. Pressure-test **60 columns**. Too-small must be an honest state, not clipped garbage. Three Kanban columns need a single-pane fallback.
- Measure **terminal cell width**, not `string.length`. Truncate; don’t wrap inside cards. Full text lives in preview/form.
- Clutter audit: at most one border between terminal edge and card content. Don’t encode the same state four ways.

### Performance

- **Never block the UI thread** on disk, network, or `herdr`. Launch is async; the card shows `starting…`.
- Derive during render; don’t sync derived fields in effects.
- Don’t define components inside components.
- Watch `.herdr-tasks/tasks` so CLI moves refresh the board. Coalesce bursts.

## CLI contract (`htasks`, non-board)

`htasks board` is a full-screen session (alternate screen). Every other subcommand is a **one-shot CLI**:

- Human default: compact tables on stdout.
- Agents: `--json` on stdout.
- Diagnostics and errors on stderr.
- Non-zero exit on: missing board, unknown id, bad lane, missing project path, unknown agent key.
- No TTY required for `list` / `show` / `move` / `path` / `root` / `doctor`.
- Shared logic in `src/lib/*` — TUI and CLI must not diverge.

Commands (see `htasks-prompt.md` for flags):

```text
htasks init [--prefix dev] [--agent grok] [--project <path>]
htasks board
htasks list [--status <lane>] [--json]
htasks show <id> [--json]
htasks create --title T [--description D] [--agent A] [--project P] [--status backlog]
htasks move <id> <lane>
htasks edit <id> [--title T] [--description D] [--agent A] [--project P]
htasks path <id>
htasks root
htasks config get|set <key> [value]
htasks agents
htasks agents add <name> --command "<cmd>" [--kind <herdr-kind>]
htasks agents remove <name>
htasks doctor [--json]
```

## Data

Discovery: walk up from cwd to `.herdr-tasks/config.toml`. TUI and CLI share that root. Fail clearly if missing, except `init`.

```text
.herdr-tasks/
  config.toml
  tasks/
    <prefix>-<n>.md
  skills/
    htasks/SKILL.md
```

Optional cache: `.herdr-tasks/.index.json`. **Source of truth is markdown + YAML frontmatter**, not the cache.

Lanes: `backlog` | `in_progress` | `done`.

Task `agent` stores the **map key** (e.g. `claude`), not the raw command. Unknown key → error, list known keys, do not guess a binary.

`command` is a shell string run in the project cwd. `kind` is only for Herdr detection.

## Move → `in_progress` (TUI and `htasks move`)

Shared hook. Do not invent Herdr APIs. Capture IDs from JSON.

1. Write `status=in_progress`.
2. `herdr` must be on PATH; on failure revert/keep prior status and print error.
3. Resolve agent from config: `command` + `kind`.
4. Create layout from `[herdr] behavior` (`workspace` default, or `tab` / `pane`).
5. Parse JSON; save `workspace_id` + `pane_id`.
6. Start `command` in that pane (project cwd). Register/detect with `kind` only if required. If `agent start` would ignore `command`, do not use that path.
7. `safe-name` = slug(task id), `[a-z][a-z0-9_-]{0,31}`, unique.
8. `herdr agent prompt …` with the first-prompt template from `htasks-prompt.md` (read the task file, follow the skill, `htasks move <id> done`).
9. If Herdr server is down, start/attach once, retry create; surface stderr.
10. Leaving `in_progress` does **not** kill Herdr in MVP.
11. If `herdr.pane_id` already set, `move in_progress` only updates status (idempotent).

## Project layout (target)

```text
src/cli/htasks.ts
src/tui/index.tsx
src/tui/app.tsx
src/tui/components/
src/lib/store.ts
src/lib/agents.ts
src/lib/herdr.ts
src/lib/ids.ts
src/lib/root.ts
skills/htasks/SKILL.md
package.json
tsconfig.json
README.md
```

Ship `skills/htasks/SKILL.md` and copy it to `.herdr-tasks/skills/htasks/` on `init`. That skill teaches agents to use **only** `htasks` (never hand-edit task markdown).

## TUI (`htasks board`)

- Columns: backlog / in_progress / done.
- Card: id, title, agent key, project basename.
- Space select; Left/Right or h/l move; Esc clear; mouse click + drag if possible.
- n/c create, e edit, Enter preview, ? help, q / Ctrl+C quit (`renderer.destroy()`).
- Form: Tab fields; Enter submit except in description (newline); Ctrl+Enter always submits; Esc cancel; title required; project path must exist; agent must be a config key.
- Default project to cwd when inside a repo; default agent to `default_agent`.

## Constraints

- No user-facing TODOs.
- No secrets, no ACP, no Rust.
- Ask only on a blocking API gap.
- Honor `NO_COLOR` if color mode is automatic; never color-only status.
- Tests: unit-test store/move/ids without a terminal; snapshot frames at 80×24 if you add TUI tests.

## Quality bar

- `htasks board` boots and restores the terminal on quit.
- `htasks create` / `htasks move` write real files.
- TUI reflects CLI moves (file watch).
- In Progress starts the mapped `command` inside Herdr.
- Skill is short and accurate.

## Build order (from the spec)

1. Scaffold (single bin `htasks`, tsconfig, README)
2. store + `.herdr-tasks/` + init + agent map
3. `htasks` CLI
4. Kanban TUI via `htasks board`
5. Shared Herdr launch hook (`command` + `kind`)
6. `skills/htasks/SKILL.md`
7. Limitations + workarounds in README
