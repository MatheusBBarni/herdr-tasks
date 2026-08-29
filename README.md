# htasks

> Kanban for [Herdr](https://herdr.dev): a terminal board and a one-shot CLI that humans and agents share.

`htasks` is this project's only binary.
`herdr` is a separate terminal multiplexer.
On-disk data lives in `.herdr-tasks/`.

Move a card to In Progress and htasks starts the mapped agent command in a Herdr pane, then sends the task file as the first prompt.
Agents update status with `htasks`, never by editing markdown.

## Features

- Terminal Kanban (`htasks board`) with backlog / in_progress / done
- Settings modal (`s`) for theme, default agent, and Herdr layout
- One-shot CLI for list, show, create, edit, and move
- `--json` on stdout for agents; compact tables for humans
- Tasks as markdown with YAML frontmatter (source of truth)
- Agent map in TOML: the card stores a key, the pane runs `command`
- `htasks doctor` for Bun, Herdr, board, skills, and agent commands

## Getting started

Requires [Bun](https://bun.sh) >= 1.3.

> [!NOTE]
> Install [Herdr](https://herdr.dev) separately and keep `herdr` on `PATH`.
> This package does not ship it.

```bash
bun install
bun link          # optional; puts `htasks` on PATH
htasks init
htasks board
```

Without linking:

```bash
bun run src/cli/htasks.ts init
bun run src/cli/htasks.ts board
```

`htasks` walks up from the current directory to find `.herdr-tasks/config.toml`.
TUI and CLI share that root.
Every command except `init` fails if no board exists.

## Names

| Name | Meaning |
|------|---------|
| `htasks` | This CLI + TUI |
| `herdr` | Multiplexer (not shipped here) |
| `.herdr-tasks/` | Data dir (`config.toml`, `tasks/`, `skills/`) |

## Quick start

```bash
htasks init --prefix dev --agent claude
htasks create --title "Add login" --description "Wire the existing auth helper."
htasks list
htasks move dev-1 in_progress
htasks doctor
```

`create` prints the new id.
`move … in_progress` writes the lane, opens a Herdr layout in the task's project, starts that agent's `command`, and sends the first prompt.

> [!TIP]
> Agents should pass `--json`.
> Errors go to stderr.
> `list`, `show`, `move`, `path`, `root`, and `doctor` do not need a TTY.

## CLI

```text
htasks init [--prefix dev] [--agent grok] [--project <path>]
htasks board
htasks list [--status <lane>] [--json]
htasks show <id> [--json]
htasks create --title T [--description D] [--type T] [--agent A] [--effort E] [--project <path|key>] [--status backlog] [--blockers id,id]
htasks move <id> <lane>
htasks edit <id> [--title T] [--description D] [--type T] [--agent A] [--effort E] [--project <path|key>] [--blockers id,id]
htasks path <id>
htasks root
htasks config get|set <key> [value]
htasks agents
htasks agents add <name> --command "<cmd>" [--kind <herdr-kind>]
htasks agents remove <name>
htasks doctor [--json]
```

Lanes: `backlog`, `in_progress`, `done`.

Unknown id, bad lane, missing project path, unknown agent key, unknown type, unknown effort, or unknown blocker exits non-zero.
A task with unfinished blockers cannot move to `in_progress`.
`--blockers` is a comma-separated list of task ids; pass `none` or empty to clear.

`htasks doctor` checks Bun, `herdr` on PATH, the Herdr server, the herdr skill (`~/.claude/skills`, `~/.agents/skills`, `~/.pi/agent/skills`, and similar), the local board, and each agent command.

## Agent map

`htasks init` writes a default map in `.herdr-tasks/config.toml`.
The task field `agent` stores the **map key**, not a binary name.

```toml
[agents.claude]
command = "ccc"
kind = "claude"
```

`command` is the shell string started inside the pane.
Wrappers and flags are allowed (`ccc`, `claude --dangerously-skip-permissions`, …).
`kind` is only for Herdr detection.

```bash
htasks agents add claude --command "claude --dangerously-skip-permissions" --kind claude
htasks agents
```

> [!IMPORTANT]
> Unknown keys are errors.
> htasks will not guess a binary.
> Form and CLI both require the key to exist in config.

## Agent effort

Each task can set an agent effort (`low`, `medium`, `high`, `xhigh`, `max`).
It is stored on the task and applied when the agent starts (`move … in_progress`).

The flag depends on the agent `kind`:

| Kind | Flag |
|------|------|
| `pi` | `--thinking <level>` |
| `codex` | `-c model_reasoning_effort=<level>` (`max` maps to `xhigh`) |
| others (`claude`, `grok`, …) | `--effort <level>` |

Empty / `none` means do not pass a flag (the agent default).
Create/edit form has an effort select.
CLI: `htasks create --title "Hard bug" --effort high`.

## Task types

Each task can have a type (`feat`, `fix`, `bug`, …).
Customize the list in `.herdr-tasks/config.toml`:

```toml
task_types = ["feat", "fix", "bug", "chore", "docs", "refactor", "test"]
default_type = "feat"
```

Create/edit form has a type select.
Cards show the type before the agent key.
CLI: `htasks create --title "Crash on save" --type bug`.

## Projects

Optional named projects in `.herdr-tasks/config.toml`:

```toml
[projects.herdr-tasks]
name = "herdr-tasks"
path = "/path/to/herdr-tasks"
```

When this list is present, the create/edit form uses a project select instead of a free-text path.
`--project` on `create` / `edit` accepts a key (`herdr-tasks`) or a filesystem path.
The task file still stores the resolved path.
`name` is the label in the form; if omitted, the table key is used.

## Herdr layout

`[herdr] behavior` in `.herdr-tasks/config.toml` chooses where a card goes when it enters In Progress:

| Value | Herdr command |
|-------|----------------|
| `workspace` (default) | `herdr workspace create --cwd <project> --label <id> --no-focus` |
| `tab` | `herdr tab create --cwd <project> --label <id> --no-focus` (adds `--workspace` when `HERDR_WORKSPACE_ID` is set) |
| `pane` | `herdr pane split --cwd <project> --no-focus` (uses `--pane $HERDR_PANE_ID`, else `--current` when `HERDR_ENV=1`) |

```bash
htasks config set herdr_behavior tab
htasks config set theme dracula
```

Board themes: `nord` (default), `catppuccin`, `catppuccin_light`, `light`, `dracula`.
Change them in the TUI with `s`, or via `htasks config set theme <name>`.
Cycling the theme field in settings previews live; Esc discards, Ctrl+Enter saves.

The board does not block on Herdr.
The card shows `starting…` until the launch finishes.
In Progress cards poll `herdr agent list` and show one live lifecycle word (`working`, `blocked`, `idle`, `done`, `unknown`, or `gone`) before the agent key and project. That status stays in board memory — it is never written to task markdown. Herdr `done` means unseen idle; it does not finish the task.
Press `o` on an in-progress card to focus that layout (`workspace focus`, `tab focus`, or `agent focus` for pane).
Press `c` on a done card to close that layout (`workspace close`, `tab close`, or `pane close`).

Leaving `in_progress` does not close that layout.

## Board

`htasks board` is a full-screen session (alternate screen).
Usable at 80×24.
Below 80 columns the board shows one lane at a time.
Below 40×10 it says the terminal is too small.

| Key | Action |
|-----|--------|
| j/k, arrows | Focus card |
| h/l, arrows | Change column, or move the selected card |
| space | Select |
| esc | Clear selection / close overlay |
| n | New task |
| c | Close the Herdr pane/tab/workspace for a done card |
| e | Edit (not done) |
| s | Settings (theme, default agent, herdr behavior, …) |
| enter | Preview |
| o | Focus the Herdr pane/tab/workspace for an in-progress card |
| ? | Help |
| q / Ctrl+C | Quit (`renderer.destroy()`) |

Create/edit form: **Tab** moves fields.
**Enter** saves, except in description where it inserts a newline.
**Ctrl+Enter** always saves.
**Esc** cancels.
Title is required.
Project path must exist (or be a key from `[projects.*]` when that list is set).
Agent must be a config key.
Type is a select from `task_types` in config (or none).
Effort is a select (`low`, `medium`, `high`, `xhigh`, `max`, or none) and is passed to the agent command when the task starts.
Blockers is a select of other tasks; Enter toggles. A task cannot move to In Progress while any blocker is not done.
Default project is cwd when you are inside a repo.
Default agent is `default_agent`.
Default type is `default_type`.

Click a card to focus it.
Drag onto another column to move.
OpenTUI has no native drag-and-drop API; the board hit-tests lanes on mouse down/up.
Keyboard can do every action.
Mouse is optional.

The board watches `.herdr-tasks/tasks`, so a CLI `move` shows up without a restart.

## Skill

`htasks init` copies `skills/htasks/SKILL.md` into `.herdr-tasks/skills/htasks/`.
Agents should use only `htasks` (never hand-edit task markdown).
Finish with `htasks move <id> done`.

The first prompt sent into Herdr looks like:

```text
You are working task <id> in repo <project>.
Read <abs-path-to-md>.
Follow <abs-path-to-SKILL.md>.
When complete: `htasks move <id> done`.
`herdr` is the multiplexer already running this <tab|workspace|pane>. `htasks` is the task board CLI.
```

## Data

```text
.herdr-tasks/
  config.toml
  tasks/
    <prefix>-<n>.md
  skills/
    htasks/SKILL.md
```

Optional cache: `.herdr-tasks/.index.json`.
Source of truth is markdown + YAML frontmatter, not the cache.

## Limitations

- Leaving `in_progress` does **not** stop the Herdr workspace.
  That is intentional so you can move a card without killing the pane.
  There is no auto-kill.
  Press `c` on a done card to close the stored pane, tab, or workspace.
- If a pane is already stored on the task and still alive, `move in_progress` only updates status.
- If the Herdr server is down, htasks tries `herdr server` once and retries.
  If that fails, start Herdr yourself and retry the move.
- `htasks config set` rewrites `config.toml` and drops comments.
- `NO_COLOR` and `TERM=dumb` disable color.
  Status is always written as text, not color-only.
- Herdr agent `done` is unseen idle. It is not `htasks move … done`.

## Develop

```bash
bun test
bun run typecheck
```
