# htasks

> Kanban for [Herdr](https://herdr.dev): a terminal board and a one-shot CLI that humans and agents share.

`htasks` is this project's only binary.
`herdr` is a separate terminal multiplexer.
On-disk data lives in `.herdr-tasks/`.

Move a card to In Progress and htasks starts the mapped agent command in a Herdr pane, then sends the task file as the first prompt.
Agents update status with `htasks`, never by editing markdown.

## Features

- Terminal Kanban (`htasks board`) with configurable lanes (default backlog / in_progress / review / done)
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

When hosted as a Herdr plugin, discovery starts at `HTASKS_ROOT`, then the workspace/worktree cwd from `HERDR_PLUGIN_CONTEXT_JSON`, then `process.cwd()`.

## Herdr plugin

htasks is also a Herdr plugin: the existing CLI+TUI, opened as an overlay pane.
Do not rewrite it, and do not replace the `htasks` CLI — plugin actions cannot pass extra args.

### Install (GitHub, not npm)

Herdr installs plugins from GitHub only (`herdr plugin install owner/repo`).
It does not read the npm registry. Do not `npm install htasks`.

```bash
herdr plugin install MatheusBBarni/herdr-tasks
```

That runs `[[build]]` (compile or `bun install`) and copies `htasks` to `~/.local/bin`.
Put `~/.local/bin` on `PATH` so agents can still run `htasks`.
Override the copy destination with `HTASKS_CLI_INSTALL_DIR`.

This public repo has `herdr-plugin.toml` on `main` and the GitHub topic `herdr-plugin`, so it is listed on [herdr.dev/plugins](https://herdr.dev/plugins/) after the next ~30 minute index refresh.

### Local authoring

`plugin link` does **not** run `[[build]]`.

```bash
herdr plugin link /path/to/herdr-tasks
herdr plugin action invoke open-board --plugin htasks
```

Linked checkouts keep using `bun link` / `bun run src/cli/htasks.ts`.

Optional keybinding in `~/.config/herdr/config.toml` (not written by install):

```toml
[[keys.command]]
key = "prefix+t"
type = "plugin_action"
command = "htasks.open-board"
description = "open htasks board"
```

`q` in the overlay calls `renderer.destroy()` and restores the previous pane.
Agents keep using `htasks move …`; they should not call `herdr plugin action invoke` for lane changes.


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
htasks create --title T [--description D] [--type T] [--agent A] [--effort E] [--project <path|key>] [--status backlog] [--blockers id,id] [--worktree yes|no]
htasks create lane --name N [--id <identifier>] [--prompt <text-or-file>] [--next-step <lane>]
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

Default lanes: `backlog`, `in_progress`, `review`, `done`. Add custom lanes with `htasks create lane` or in `config.toml`.

Unknown id, bad lane, missing project path, unknown agent key, unknown type, unknown effort, unknown worktree, or unknown blocker exits non-zero.
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

## Worktrees

Create/edit form has a Worktree select (`Yes` / `No`, default `No`).
When `Yes`, `move … in_progress` creates a Git worktree through Herdr on `<type>/<id>` (e.g. `feat/dev-11`), then opens the configured Herdr layout inside that checkout and starts the agent there.

CLI: `htasks create --title "Isolated fix" --type fix --worktree yes`.

The task `project` stays the original repo path.
If `.herdr-tasks` is gitignored, htasks symlinks it into the worktree so `htasks move <id> done` still finds the board.

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

## Custom lanes

The `lanes` array is the board column order. Identifiers are stored as task `status`.
A `[lane.<id>]` table sets the name shown on the board, an optional prompt, and `next_step` (where the agent should `htasks move` next).

```toml
lanes = ["backlog", "in_progress", "review", "qa", "done"]

[lane.qa]
name = "QA"
prompt = "prompts/qa.md"  # or inline text
next_step = "done"
```

`prompt` is a file under `.herdr-tasks/prompts/` (or another path) or inline text.
Moving a task into a prompted lane reuses a live Herdr pane when one exists, then sends that prompt (same as review).

```bash
htasks create lane --name QA --prompt prompts/qa.md --next-step done
htasks move dev-1 qa
```


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

`[herdr] behavior` in `.herdr-tasks/config.toml` chooses where a card goes when it enters In Progress (and Review only when there is no live pane):

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
Press `o` on a launch-lane card (in progress, review, or a prompted custom lane) to focus that layout (`workspace focus`, `tab focus`, or `agent focus` for pane).
Press `c` on a done card to close that layout (`workspace close`, `tab close`, or `pane close`).

Leaving `in_progress` does not close that layout.

## Board

`htasks board` is a full-screen session (alternate screen).
Usable at 80×24.
Below 80 columns the board shows one lane at a time.
Lanes keep a minimum width of 20 columns. Extra lanes stay off-screen until you move into them with h/l or scroll.
Below 40×10 it says the terminal is too small.

| Key | Action |
|-----|--------|
| j/k, arrows | Focus card, or reorder the selected card |
| h/l, arrows | Change column, or move the selected card |
| space | Select |
| f | Filter cards in the focused lane (title, id, description, …) |
| esc | Clear filter, selection, or close overlay |
| n | New task |
| c | Close the Herdr pane/tab/workspace for a done card |
| e | Edit (not done) |
| s | Settings (theme, default agent, herdr behavior, …) |
| enter | Preview |
| o | Focus the Herdr pane/tab/workspace for a launch-lane card |
| ? | Help |
| q | Quit (`renderer.destroy()`) |
| Ctrl+C | Copy selection, focused field, or card |
| Ctrl+V | Paste into a focused field |

Create/edit form: **Tab** moves fields.
**Enter** saves, except in description where it inserts a newline.
**Ctrl+Enter** always saves.
**Esc** cancels.
Title is required.
Project path must exist (or be a key from `[projects.*]` when that list is set).
Agent must be a config key.
Type is a select from `task_types` in config (or none).
Effort is a select (`low`, `medium`, `high`, `xhigh`, `max`, or none) and is passed to the agent command when the task starts.
Worktree is Yes or No (default No). Yes starts the agent in a new git worktree on `<type>/<id>`.
Blockers is a select of other tasks; Enter toggles. A task cannot move to In Progress while any blocker is not done.
Default project is cwd when you are inside a repo.
Default agent is `default_agent`.
Default type is `default_type`.

Descriptions are markdown.
Put an image in as a link (`![alt](https://example.com/shot.png)` or the URL itself).
Preview shows that URL as a terminal hyperlink, not an image preview.

Click a card to focus it.
Drag onto another column to move.
OpenTUI has no native drag-and-drop API; the board hit-tests lanes on mouse down/up.
Keyboard can do every action.
Mouse is optional.

The board watches `.herdr-tasks/tasks`, so a CLI `move` shows up without a restart.

## Skill

`htasks init` copies `skills/htasks/SKILL.md` into `.herdr-tasks/skills/htasks/` and a default review prompt into `.herdr-tasks/prompts/review.md`.
Agents should use only `htasks` (never hand-edit task markdown).
After implementation: `htasks move <id> review`.
After review: `htasks move <id> done`.

The first prompt sent into Herdr looks like:

```text
You are working task <id> in repo <project>.
Read <abs-path-to-md>.
Follow <abs-path-to-SKILL.md>.
When complete: `htasks move <id> review`.
`herdr` is the multiplexer already running this <tab|workspace|pane>. `htasks` is the task board CLI.
```

## Review lane

After In Progress, move the card to **Review**.
That reuses the existing Herdr pane (it does not open another workspace/tab/pane) and sends the `[review] skill` file body (if set) then the `[review] prompt` file.
If the card has no live pane, it creates a layout like In Progress.
Empty `[review] prompt` uses the default `.herdr-tasks/prompts/review.md`.

Configure it in `.herdr-tasks/config.toml`:

```toml
[review]
# optional agent map key; empty uses the task's agent
agent = ""
# skill name (.agents/skills/<name>/SKILL.md) or path to SKILL.md
skill = "thermo-nuclear-code-quality-review"
# extra prompt file (absolute or relative to the board root)
prompt = ".herdr-tasks/prompts/review.md"
```

`htasks init` writes that prompt file and points `[review] prompt` at it.
Edit the file to change what the reviewer is asked to do.

You can skip review with `htasks move <id> done` from in_progress.

## Data

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

Optional cache: `.herdr-tasks/.index.json`.
Source of truth is markdown + YAML frontmatter, not the cache.

## Limitations

- Leaving `in_progress` does **not** stop the Herdr workspace.
  That is intentional so you can move a card without killing the pane.
  There is no auto-kill.
  Press `c` on a done card to close the stored pane, tab, or workspace.
- If a pane is already stored on the task and still alive, `move in_progress` only updates status.
- `move review` reuses a live pane from in_progress and sends the review prompt there. It only creates a new layout when there is no live pane. If the task is already in review and the pane is alive, it only updates status.
- If the Herdr server is down, htasks tries `herdr server` once and retries.
  If that fails, start Herdr yourself and retry the move.
  Inside Herdr (`HERDR_ENV=1`) it does not start a server; it uses `$HERDR_BIN_PATH`.
- `herdr plugin action invoke` cannot pass extra args.
  Keep using the `htasks` CLI.
  `plugin install` copies `htasks` to `~/.local/bin` (not on `plugin link`).
  There is no npm package; distribution is `herdr plugin install MatheusBBarni/herdr-tasks`.
- Press `q` to close the overlay before `o` if the board is covering the task layout.
- `htasks config set` rewrites `config.toml` and drops comments.
- `NO_COLOR` and `TERM=dumb` disable color.
  Status is always written as text, not color-only.
- Herdr agent `done` is unseen idle. It is not `htasks move … done`.

## Develop

```bash
bun test
bun run typecheck
herdr plugin link .
herdr plugin action invoke open-board --plugin htasks
```

This repo is tagged `herdr-plugin` so [herdr.dev/plugins](https://herdr.dev/plugins/) indexes it (refresh ~30 minutes).
