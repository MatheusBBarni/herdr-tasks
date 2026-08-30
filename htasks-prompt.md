# htasks — agent prompt

You are a senior TypeScript TUI and CLI engineer. Build a production-ready Kanban task runner as a Bun project using OpenTUI React and a CLI named `htasks`. Do not use Rust. Do not use ACP.

## Naming (strict)

- `herdr` = existing terminal multiplexer. Never ship a binary named herder or herdr.
- `htasks` = this project's only binary (CLI + TUI).
- Data dir = `.herdr-tasks/` (leading dot). Not `.herder-tasks`, not `.tasks`.
- Do not name packages or bins `herder`.

## What to build

1. A terminal Kanban (OpenTUI + React) opened with `htasks board`.
2. On-disk storage under `.herdr-tasks/`.
3. CLI `htasks` so humans and agents can list, show, create, edit, and move tasks.
4. An agent skill that teaches coding agents to use `htasks` only.

## Context

Start from a projects root or a repo root. Each task has a `project` path (local repo). Moving a card into In Progress starts a Herdr workspace in that repo, starts the mapped agent command in a pane, and sends the task file as the first prompt. Agents change status with `htasks`, never by editing markdown.

## Goal

MVP: board + form + persistence + Herdr launch + `htasks` CLI + skill.

## Stack

- Bun >= 1.3
- `@opentui/core` + `@opentui/react` + React 19
- `jsxImportSource`: `@opentui/react`
- TOML config, markdown tasks with YAML frontmatter
- `Bun.spawn` for the `herdr` CLI; parse JSON stdout
- `package.json` bin: only `"htasks": "src/cli/htasks.ts"`

## Commands

```text
htasks init [--prefix dev] [--agent grok] [--project <path>]
htasks board
htasks list [--status <lane>] [--json]
htasks show <id> [--json]
htasks create --title T [--description D] [--type T] [--agent A] [--effort E] [--project <path|key>] [--status backlog] [--blockers id,id] [--worktree yes|no]
htasks move <id> <lane>
htasks edit <id> [--title T] [--description D] [--type T] [--agent A] [--effort E] [--project <path|key>] [--blockers id,id] [--worktree yes|no]
htasks path <id>
htasks root
htasks config get|set <key> [value]
htasks agents
htasks agents add <name> --command "<cmd>" [--kind <herdr-kind>]
htasks agents remove <name>
htasks doctor [--json]
```

## Data layout (`htasks init`)

```text
.herdr-tasks/
  config.toml
  prompts/
    review.md
  tasks/
    <prefix>-<n>.md
  skills/
    htasks/SKILL.md
```

Optional cache: `.herdr-tasks/.index.json`. Source of truth is markdown + frontmatter.

## `config.toml`

```toml
prefix = "dev"
theme = "nord"
default_agent = "claude"
default_project = ""
task_types = ["feat", "fix", "bug", "chore", "docs", "refactor", "test"]
default_type = "feat"
lanes = ["backlog", "in_progress", "review", "done"]
next_id = 1

[herdr]
bin = "herdr"
# tab | workspace | pane
behavior = "workspace"

# Review lane after in_progress. Empty agent uses the task's agent.
# skill = skill name or path to SKILL.md
# init writes .herdr-tasks/prompts/review.md and points prompt at it.
[review]
agent = ""
skill = ""
prompt = ".herdr-tasks/prompts/review.md"

# name shown on cards / form = key
# command = argv started inside the Herdr pane (aliases, wrappers, flags allowed)
# kind = herdr --kind for detection (optional; default = name if herdr knows it)

[agents.claude]
command = "ccc"
kind = "claude"

[agents.grok]
command = "grok"
kind = "grok"

[agents.codex]
command = "codex"
kind = "codex"

[agents.opencode]
command = "opencode"
kind = "opencode"

# optional named projects; when present, the task form uses a select
# [projects.herdr-tasks]
# name = "herdr-tasks"
# path = "/path/to/herdr-tasks"
```

## Agent map rules

- Task field `agent` stores the map key (e.g. `claude`), not the raw command.
- Form select is the keys of `[agents.*]`. Allow typing a new key only if they also provide a command, or require agents to exist in config.
- `htasks init` writes the default map above. Users edit config to add wrappers (`ccc`, `claude --dangerously-skip-permissions`, etc.).
- Launch must run `command` as the pane process. Prefer: create workspace/pane, `herdr pane run <pane_id> "<command>"` (or documented equivalent), then `herdr agent start <safe-name> --kind <kind> --pane <pane_id>` if that is required for detection. If `agent start` would start its own binary and ignore `command`, do not use that path — start `command` in the pane and let Herdr detect it. Do not invent Herdr flags. Use real CLI: workspace create, pane run/send, agent start/prompt only as documented.
- `command` is a shell string executed in the project cwd. Do not treat it as a herdr kind.
- Unknown agent key → error, list known keys, do not guess a binary.
- `kind` is only for Herdr detection (`claude`, `codex`, `grok`, `opencode`, …). If omitted, use the map key when it is a known kind; otherwise leave detection to Herdr.

## Project list

Optional `[projects.<key>]` tables with `name` (form label; defaults to the key) and `path` (required).
When at least one project is listed, the create/edit form uses a select instead of a text input.
CLI `--project` accepts a key or a filesystem path. Task markdown still stores the resolved path.
Unknown bare keys error and list known keys. Free-form paths remain valid.

## Task markdown

```md
---
id: "dev-1"
title: "Add login"
status: backlog
type: feat
agent: claude
effort: high
project: /abs/or/relative/path/to/repo
created: 2026-08-28T17:00:00Z
updated: 2026-08-28T17:00:00Z
herdr:
  workspace_id: null
  pane_id: null
  agent_name: null
---

# Add login

Description.
```

## Discovery

- Walk up from cwd to find `.herdr-tasks/config.toml`.
- TUI and CLI share that root.
- Fail clearly if missing, except `init`.

Lanes: `backlog` | `in_progress` | `review` | `done`

## TUI (`htasks board`)

- Fields: title, description, type (from config `task_types`), agent (from config map), effort (`low`/`medium`/`high`/`xhigh`/`max` or none), project path (select from `[projects.*]` when present, else text), worktree (Yes/No, default No), blockers (select of other task ids)
- Save → `.herdr-tasks/tasks/<prefix>-<next_id>.md`, bump `next_id`
- 4 columns; card: id, title, type, agent key, project basename
- Space select; Left/Right or h/l move; Esc clear; mouse click + drag
- n create, c close Herdr layout (done), e edit, s settings, Enter preview, o focus Herdr layout (in_progress / review), ? help, q / Ctrl+C quit (destroy renderer)
- Form: Tab fields; Enter submit except in description (newline) and blockers (toggle); Ctrl+Enter always submits; Esc cancel; title required; project path must exist (select from `[projects.*]` when present); agent must be a config key; effort is applied when starting the agent; worktree is Yes/No (default No); blockers is a select of other tasks
- Default project to cwd when inside a repo
- Default agent to `default_agent`
- Watch `.herdr-tasks/tasks` so CLI moves refresh the board
- Usable at 80x24

## Move → `in_progress` (shared hook: TUI and `htasks move`)

1. If any `blockers` id is missing or not `done`, fail and do not change status
2. Write `status=in_progress`
3. `herdr` must be on PATH; on failure revert/keep prior status and print error
4. Resolve agent from config: `command` + `kind`
5. If worktree is yes, create a Herdr git worktree on `<type>/<id>` (e.g. `feat/dev-11`) then create layout from `[herdr] behavior` (`workspace` default, or `tab` / `pane`) with `--cwd` of that checkout. Otherwise create layout in the task project.
6. Parse JSON; save `workspace_id` + `pane_id`
7. Start `command` in that pane (project cwd), appending the task's effort flag for the agent `kind` when effort is set. Then register/detect with herdr using `kind` if needed.
8. `safe-name` = slug(task id), `[a-z][a-z0-9_-]{0,31}`, unique
9. `herdr agent prompt <safe-name-or-pane>`:
   - read and execute the task file
   - absolute path to the markdown
   - use `htasks` + skill path to update status (`htasks move <id> review`)
10. If Herdr server is down, start/attach once, retry create; surface stderr
11. Never invent Herdr APIs. Capture IDs from JSON.
12. Leaving `in_progress` does not kill Herdr in MVP.
13. If `herdr.pane_id` already set, `move in_progress` only updates status (idempotent).

## Move → `review` (shared hook: TUI and `htasks move`)

1. Write `status=review`
2. `herdr` must be on PATH; on failure revert/keep prior status and print error
3. Resolve agent from `[review] agent` if set, else the task agent
4. Create a new Herdr layout (do not reuse the in_progress pane). Worktree yes reuses the task checkout
5. Start that agent's `command` in the pane
6. Prompt with `[review] skill` name/text (if set), then the contents of the `[review] prompt` file (if set)
7. Missing `[review] skill` or `[review] prompt` path is an error
8. If already `review` and `herdr.pane_id` is still alive, only update status (idempotent)
9. Leaving `review` does not kill Herdr in MVP

## CLI rules

- Human: compact tables. Agents: `--json`
- `move` updates status + updated
- No TTY required for list/show/move/path
- Non-zero exit on missing board, unknown id, bad lane, missing project, unknown agent key, unknown type, unknown effort, unknown worktree, unknown blocker, unfinished blockers on move to in_progress
- Shared lib for TUI and CLI (`src/lib/*`)

## Agent skill

`skills/htasks/SKILL.md`, copied into `.herdr-tasks/skills/htasks/` on init:

- Use only `htasks`. Do not edit `.herdr-tasks/tasks/*.md` by hand
- `htasks root` / `htasks list --json` / `htasks show <id> --json`
- Create: `htasks create --title T [--description D] [--type T] [--agent A] [--effort E] [--project P] [--status backlog] [--blockers id,id] [--worktree yes|no]`
- Start work: `htasks move <id> in_progress`
- After implementation: `htasks move <id> review`
- After review: `htasks move <id> done`
- Do not create extra tasks unless asked
- Do not kill Herdr panes
- `htasks` = board CLI. `herdr` = multiplexer. `.herdr-tasks` = data dir.

### First agent prompt template

```text
You are working task <id> in repo <project>.
Read <abs-path-to-md>.
Follow <abs-path-to-SKILL.md>.
When complete: `htasks move <id> review`.
`herdr` is the multiplexer already running this <tab|workspace|pane>. `htasks` is the task board CLI.
```

### Review agent prompt template

```text
<skill name>          # [review] skill, if set
<prompt file body>    # contents of [review] prompt, if set
```

## Project structure

```text
src/cli/htasks.ts
src/tui/index.tsx
src/tui/app.tsx
src/tui/components/
src/lib/store.ts
src/lib/agents.ts          # load/validate agent map
src/lib/herdr.ts
src/lib/ids.ts
src/lib/root.ts
skills/htasks/SKILL.md
package.json
tsconfig.json
README.md
```

## README must cover

- bun install
- herdr installed separately
- `htasks init` then `htasks board`
- how to map `ccc` / custom flags in `[agents.<name>]`
- layout, keys, skill
- names: `htasks` vs `herdr` vs `.herdr-tasks`

## Constraints

- Strict TypeScript
- No user-facing TODOs
- Do not invent OpenTUI or Herdr APIs
- If OpenTUI lacks drag-and-drop, mouse down/move/up + lane hit-testing, document it
- Do not block the UI on Herdr; card shows “starting…”
- No secrets, no ACP
- Ask only on a blocking API gap

## Quality bar

- `htasks board` boots
- `htasks create` / `htasks move` write real files
- TUI reflects CLI moves
- In Progress starts the mapped `command` inside Herdr
- Skill is short and accurate

## Now produce

1. Scaffold (single bin `htasks`, tsconfig, README)
2. store + `.herdr-tasks/` + init + agent map
3. `htasks` CLI
4. Kanban TUI via `htasks board`
5. Shared Herdr launch hook using command + kind
6. `skills/htasks/SKILL.md`
7. Limitations + workarounds
