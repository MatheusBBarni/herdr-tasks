# Spike: ship htasks as a Herdr plugin

**Task:** `dev-7`  
**Herdr studied:** 0.8.2 (stable, protocol docs at herdr.dev)  
**Sources:** [Plugins](https://herdr.dev/docs/plugins/), [Marketplace](https://herdr.dev/docs/marketplace/), [Socket API](https://herdr.dev/docs/socket-api/), `herdr plugin --help`, installed plugin `persiyanov.reviewr`, examples in `ogulcancelik/herdr-plugin-examples`, and the existing Kanban plugin `nelsonPires5/herdr-board`.

## Verdict

**Yes.** Herdr plugin v1 is a host for ordinary executables, not an in-process SDK. `htasks board` is already a TUI, `htasks` is already a CLI that talks to Herdr, and plugin panes are normal PTYs. That is a packaging and discovery problem, not a rewrite.

Do **not** throw away the CLI, the markdown store, or Bun. Do **not** rewrite in Rust. Ship a `herdr-plugin.toml` that opens the existing board as a Herdr-managed overlay, keep `htasks` as the only binary and the agent-facing CLI, and install that binary onto `PATH` at plugin install time.

A mature competitor already exists (`herdr-board`). htasks should stay the simpler, repo-local, markdown-backed board — not a clone of that pipeline/daemon product.

---

## 1. How a Herdr plugin works

### Model

A plugin is a directory with `herdr-plugin.toml` plus commands Herdr can spawn. There is **no plugin SDK and no restricted API**. The plugin API *is* the Herdr CLI (prefer `$HERDR_BIN_PATH`) and, if needed, the socket API (`$HERDR_SOCKET_PATH`).

Herdr owns:

- install / link / enable / disable
- manifest validation
- keybindings (`type = "plugin_action"`)
- terminal panes (overlay, popup, split, tab, zoomed)
- event hooks
- invocation context and logs
- per-plugin config/state directories

The plugin owns language, deps, files, and durable state.

v1 does **not** include:

- runtime action registration
- native non-terminal UI (no React-in-Herdr-chrome, no widgets inside the sidebar)
- a Herdr-managed storage API
- extra argv on `herdr plugin action invoke` (the command is fixed in the manifest)

### Manifest surface

Required: `id`, `name`, `version`, `min_herdr_version`. Optional: `description`, `platforms`.

| Block | Role |
|---|---|
| `[[build]]` | Runs on GitHub `plugin install` only. Not on `plugin link`. |
| `[[startup]]` | One-shot after session restore when the API socket is ready. Not a daemon supervisor. |
| `[[actions]]` | Keybindable / menu commands. Ids are local (`open`), globally `plugin.id.action`. |
| `[[events]]` | Spawn a command when Herdr emits a named event. Unknown names warn, they do not fail link. |
| `[[panes]]` | Entrypoints Herdr can open as terminals. |
| `[[link_handlers]]` | Ctrl-click URL → plugin action. |

`command` is an argv array. No shell unless the argv starts one.

### Lifecycle commands

```bash
herdr plugin install owner/repo[/subdir] [--ref REF] [--yes]
herdr plugin link /path/to/plugin          # local authoring; does not run [[build]]
herdr plugin list [--json]
herdr plugin action list --plugin <id>
herdr plugin action invoke <action_id> [--plugin <id>]
herdr plugin pane open --plugin <id> --entrypoint <id> [--placement overlay|popup|split|tab|zoomed]
herdr plugin config-dir <id>
herdr plugin log list --plugin <id>
```

Install is GitHub-only shorthand. Linked and installed plugins are **user-global**, not per-session.

### Runtime environment

Working directory of plugin commands is the plugin root. Herdr injects:

- `HERDR_BIN_PATH`, `HERDR_SOCKET_PATH`, `HERDR_ENV=1`
- `HERDR_PLUGIN_ID`, `HERDR_PLUGIN_ROOT`
- `HERDR_PLUGIN_CONFIG_DIR` — user-editable config (survives reinstall)
- `HERDR_PLUGIN_STATE_DIR` — local runtime state
- `HERDR_PLUGIN_CONTEXT_JSON` — workspace, tab, focused pane, worktree, agent, selection, URL when present
- `HERDR_WORKSPACE_ID` / `HERDR_TAB_ID` / `HERDR_PANE_ID` when they exist
- action: `HERDR_PLUGIN_ACTION_ID`
- event: `HERDR_PLUGIN_EVENT`, `HERDR_PLUGIN_EVENT_JSON`
- pane: `HERDR_PLUGIN_ENTRYPOINT_ID`

Do not store user data under `HERDR_PLUGIN_ROOT` (GitHub installs replace that checkout).

### Panes (the important bit for a board)

`placement` defaults to `overlay`: a temporary zoomed terminal over the active pane. Closing it restores previous focus. Other placements: `popup` (session-modal, **no pane id**), `split`, `tab`, `zoomed`.

Split / tab / zoomed / overlay panes become normal Herdr panes. Plugins can `pane.move` / `resize` / `zoom`. Overlay is what `herdr-board` uses for its Kanban TUI.

Actions do not open panes by themselves. The usual pattern is:

1. Declare `[[panes]]` with the TUI command.
2. Declare `[[actions]]` whose command is a small launcher script.
3. The launcher calls `$HERDR_BIN_PATH plugin pane open …` (often open-or-focus-or-toggle).

Proven by `nelsonPires5/herdr-board` (`scripts/open-board.sh`) and `persiyanov/herdr-reviewr` (`herdr/sidebar.sh`).

### Events plugins can hook

Plugin hooks fire on named lifecycle events. Useful ones:

- `worktree.created` / `worktree.opened` / `worktree.removed`
- `pane.agent_status_changed`, `pane.agent_detected`, `pane.closed`, `pane.exited`
- `workspace.created` / `workspace.closed` / `workspace.focused`
- `tab.created` / `tab.closed`

`workspace.metadata_updated` is **not** delivered to plugin hooks. Startup is `HERDR_PLUGIN_EVENT=startup`, not an `[[events]]` `on` value.

### Distribution

Public GitHub repos tagged `herdr-plugin` with a parseable `herdr-plugin.toml` show up on [herdr.dev/plugins](https://herdr.dev/plugins/) within ~30 minutes. Unreviewed.

### Trust

Plugin code runs as the user with full CLI access. `plugin install` shows a preview of commands unless `--yes`.

---

## 2. Can htasks become a plugin?

**Yes**, because the product already matches the host:

| htasks today | Plugin v1 equivalent |
|---|---|
| `htasks board` (OpenTUI, alt-screen, mouse) | `[[panes]]` overlay/tab running that TUI |
| `htasks move` → `herdr workspace/tab/pane` + `pane run` + `agent prompt` | Same code, call `$HERDR_BIN_PATH` |
| Agent skill uses `htasks` CLI | Keep CLI on `PATH` (plugin install copies it) |
| `.herdr-tasks/` markdown + TOML | Keep it. No plugin storage API anyway |
| File watch so CLI moves refresh the TUI | Unchanged inside the plugin pane |

TUIs inside plugin panes are a known-good pattern: reviewr (Rust TUI, split), herdr-plus (Bubble Tea pickers, overlay/zoomed), herdr-board (Kanban overlay). OpenTUI is just another full-screen TUI on a PTY.

### What does *not* map 1:1

1. **`plugin.action.invoke` cannot pass extra args.** Agents cannot do `herdr plugin action invoke move -- dev-7 done`. They must keep calling `htasks move …`. The CLI is load-bearing.

2. **Pane cwd is the plugin root**, not the user's repo. Today's `findBoardRoot(process.cwd())` would miss `.herdr-tasks/` unless we resolve from workspace/worktree cwd in `HERDR_PLUGIN_CONTEXT_JSON` (and still allow `--cwd` / walk-up).

3. **`herdr_bin` in config.toml defaults to `"herdr"`.** Inside a plugin it should prefer `$HERDR_BIN_PATH`.

4. **`ensureHerdrServer()`** tries to start a server. Inside Herdr (`HERDR_ENV=1`) the server is already up. Skip start/attach when running as a plugin.

5. **OpenTUI is Zig-native (`libopentui.dylib`).** A GitHub install cannot assume the user has Bun + a compiled `node_modules`. Need a build story (see below).

6. **No native Herdr chrome.** The board cannot become a sidebar widget. Overlay / split / tab is the whole UI surface.

7. **Competitor:** `herdr plugin install nelsonPires5/herdr-board` is already a Kanban that dispatches agents. Different product (SQLite daemon, pipelines, global store, Rust, `board` CLI). Overlap is the *host integration* (overlay + PATH CLI), not the data model.

### Constraints we must keep

From `AGENTS.md` / `htasks-prompt.md`:

- Only binary: `htasks` (plugin commands invoke that binary; no second product name).
- Do not ship a binary named `herdr` / `herder`.
- Do not use Rust or ACP.
- Bun + OpenTUI React + markdown tasks.

A plugin wrapper respects all of that.

---

## 3. What we need to do (if we proceed)

### 3.1 Add a manifest (smallest possible plugin)

```toml
id = "htasks"
name = "htasks"
version = "0.1.0"
min_herdr_version = "0.8.2"
description = "Kanban for Herdr: markdown tasks, OpenTUI board, htasks CLI."
platforms = ["linux", "macos"]

[[build]]
command = ["bash", "scripts/plugin-build.sh"]

[[panes]]
id = "board"
title = "htasks"
placement = "overlay"
command = ["bash", "scripts/run-board.sh"]

[[actions]]
id = "open-board"
title = "Open htasks board"
contexts = ["workspace", "pane"]
command = ["bash", "scripts/open-board.sh"]
```

Local loop while authoring:

```bash
herdr plugin link /Users/matheusbbarni/projects/herdr-tasks
herdr plugin action invoke open-board --plugin htasks
```

`plugin link` does not run `[[build]]`; run the board via Bun from the checkout until the compile path exists.

### 3.2 Launcher script (open / focus / toggle)

Copy the herdr-board pattern:

- No htasks pane in this workspace → `plugin pane open --entrypoint board --placement overlay --focus`
- Pane exists, unfocused → `plugin pane focus`
- Pane is focused → close it (`pane close`)

Identify the pane by static title `htasks` (or a prefix). Use `$HERDR_BIN_PATH`.

Optional user keybinding (documented, not auto-written — writing `~/.config/herdr/config.toml` from install is hostile):

```toml
[[keys.command]]
key = "prefix+t"
type = "plugin_action"
command = "htasks.open-board"
description = "open htasks board"
```

### 3.3 Board-root discovery when hosted by Herdr

Change `requireBoardRoot()` so the search start is, in order:

1. Explicit override (`HTASKS_ROOT` or a future flag).
2. Workspace / worktree cwd from `HERDR_PLUGIN_CONTEXT_JSON` (and `plugin pane open --cwd` if we pass it).
3. `process.cwd()` (today’s behavior, still required for the standalone CLI).

`run-board.sh` should pass `--cwd` of the focused workspace when opening the pane so cards default `project` correctly.

Keep `.herdr-tasks/` in the **project** (or a chosen board root). Do not move the store into `HERDR_PLUGIN_STATE_DIR`. That directory is for plugin-private cache (last-opened board path, overlay placement pref), not tasks.

### 3.4 Herdr client when already inside Herdr

In `src/lib/herdr.ts` / `move.ts` / TUI focus:

- Bin: `process.env.HERDR_BIN_PATH || config.herdr_bin || "herdr"`
- If `HERDR_ENV=1`, do not spawn `herdr server`; treat the injected socket as authoritative.
- Prefer creating layout relative to the current workspace (`herdr.behavior = tab|pane` becomes more natural when the board itself is a Herdr overlay). Default can stay `workspace` for standalone CLI use.

### 3.5 Keep the CLI on PATH (agents)

Agents still run `htasks move <id> done`. Plugin checkouts are not on `PATH`.

At `plugin install` time, after building, copy the `htasks` executable to `~/.local/bin/htasks` (override via env), same idea as herdr-board’s `install-cli.sh`. Document that `~/.local/bin` must be on `PATH`.

`plugin link` will not run that copy; local dev keeps using `bun link` / `bun run src/cli/htasks.ts`.

Do **not** try to replace the agent CLI with plugin actions. Invoke has no extra argv.

### 3.6 Runtime / install (the hard part)

OpenTUI loads a native Zig library (`@opentui/core-darwin-arm64` → `libopentui.dylib`). Users of `herdr plugin install` will not have this repo’s `node_modules`.

Pick one, in this order:

| Option | Pros | Cons |
|---|---|---|
| **A. `bun build --compile` in `[[build]]`** | One binary, matches “only bin is htasks” | Needs Bun on the *installer’s* machine; must verify Zig dylib embedding; macOS/Linux (and arch) matrix |
| **B. `[[build]]` runs `bun install` and pane command is `bun run src/cli/htasks.ts board`** | Simplest | Every user needs Bun; slow cold start; GitHub checkout + node_modules in plugin root |
| **C. CI releases prebuilt binaries; `[[build]]` downloads like reviewr** | Users need no Bun | Release engineering; codesign; still multi-arch |

**Recommendation:** prove A locally (`bun build --compile` of `src/cli/htasks.ts`, then run the binary inside `herdr plugin pane open`). If the dylib does not embed, fall back to B for the first plugin release (document Bun as a plugin requirement) and add C later.

Windows: skip until Herdr’s Windows beta + OpenTUI native builds are boring. Manifest `platforms = ["linux", "macos"]`.

### 3.7 TUI behavior in an overlay

Already close: `q` / Ctrl+C calls `renderer.destroy()`, which exits the process and therefore closes an overlay pane. Keep that. Do not `process.exit()` (OpenTUI contract).

Pressure-test:

- mouse drag between columns inside a Herdr overlay (Herdr is mouse-first; capture vs OS copy is a known OpenTUI pitfall)
- 80×24 and the existing too-small state when the overlay is not full-terminal
- `o` focus of the task’s Herdr layout while the board overlay is open (may need to close or unfocus the overlay first)

### 3.8 Skill / docs

- Skill stays “use only `htasks`”. Add one line: humans may open the board with `herdr plugin action invoke open-board --plugin htasks`.
- README: install via `herdr plugin install <owner>/herdr-tasks` *and* the existing Bun path.
- Tag the GitHub repo `herdr-plugin` when publishing.
- `htasks doctor`: check plugin link/install optional; still check Bun / herdr / board.

### 3.9 What we should not build in the first plugin cut

- Event hooks that auto-move cards on `pane.agent_status_changed` (tempting, easy to get wrong; MVP already relies on the agent calling `htasks move … done`).
- Startup hook that always re-opens the board (noisy).
- A daemon (`boardd`). We already have files + a file watcher.
- SQLite, pipelines, multi-board global store — that is herdr-board.
- Writing keybindings into the user’s Herdr config.
- Second binary name.

### 3.10 Suggested implementation order

1. Manifest + `open-board.sh` + `run-board.sh` that execs `bun run src/cli/htasks.ts board`.
2. `herdr plugin link` this repo; open overlay; confirm quit restores the previous pane.
3. Board-root + `HERDR_BIN_PATH` + skip server start when `HERDR_ENV=1`.
4. Prove move-to-in_progress from the overlay still creates layout and prompts.
5. Compile/install-cli path.
6. README + skill + marketplace topic.
7. Only then consider `pane.agent_status_changed` or a persistent split placement.

---

## 4. htasks vs herdr-board

| | **htasks** (this repo) | **herdr-board** |
|---|---|---|
| Store | `.herdr-tasks/` markdown + YAML in the project | SQLite under `~/.local/share/herdr-board/` |
| Runtime | No daemon; TUI watches files | `boardd` daemon |
| Lanes | Fixed backlog / in_progress / done | User columns, auto/manual gates, pipelines |
| Agent CLI | `htasks` | `board` |
| Stack | Bun, OpenTUI React | Rust |
| Host | Standalone today; plugin is additive | Plugin-first overlay |

If the goal is “a Herdr-native Kanban with pipelines,” use or contribute to herdr-board. If the goal is “tasks as files in the repo, agents already know `htasks`,” wrap this project as a plugin and keep the model.

---

## 5. Risks to prove before calling it done

1. **OpenTUI inside a Herdr overlay** — mouse, alt-screen, resize, `q` restores focus. Highest UX risk, cheapest to test (`plugin link` + Bun).
2. **`bun build --compile` + `libopentui`** — whether a single binary is shippable without Bun on the user’s PATH.
3. **Board discovery** — overlay cwd is plugin root; without context-based discovery the board looks empty.
4. **Focus dance** — `o` (focus task layout) vs overlay owning focus.
5. **PATH** — agents in new workspaces must see `htasks` after plugin install.

None of these are plugin-API gaps. They are integration tests.

---

## 6. Answer to the task

- **How a Herdr plugin works:** a `herdr-plugin.toml` plus argv commands; Herdr launches them in actions, event hooks, startup, or terminal panes; the CLI/socket is the API.
- **Can we transform this project?** **Yes**, as a plugin *hosting* the existing CLI+TUI. Not as an in-process Herdr module, and not by deleting `htasks`.
- **What to do:** add manifest + overlay launcher, fix cwd/bin/server assumptions, ship/install the `htasks` binary onto `PATH`, document a keybinding, keep markdown + skill. Prove OpenTUI-in-overlay and the compile story before marketing it as `herdr plugin install`.
