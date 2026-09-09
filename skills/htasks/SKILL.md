# htasks

Use **only** `htasks` to read and update tasks. Never edit `.herdr-tasks/tasks/*.md` by hand.

`htasks` is the board CLI. `herdr` is the multiplexer already running this pane. `.herdr-tasks` is the data dir.
Humans may open the board with `herdr plugin action invoke open-board --plugin htasks` (or a keybinding for `htasks.open-board`). Agents still use only this CLI — plugin actions cannot pass extra args.

## Commands

```bash
htasks root
htasks list --json
htasks show <id> --json
htasks create --title T [--description D] [--type T] [--agent A] [--effort E] [--project P] [--status backlog] [--blockers id,id] [--worktree yes|no]
htasks create lane --name N [--id <identifier>] [--prompt <text-or-file>] [--next-step <lane>]
htasks move <id> <lane>
htasks edit <id> [--title T] [--description D] [--type T] [--agent A] [--effort E] [--project P] [--blockers id,id] [--worktree yes|no]
```

`create` covers the board form fields: `--title` (required), `--description`, `--type` (from config `task_types`), `--agent` (config map key), `--effort` (`low`, `medium`, `high`, `xhigh`, `max`), `--project` (must exist), `--blockers` (comma-separated task ids), `--worktree yes|no` (default `no`). `--status` is CLI-only; default `backlog`. Prints the new id.
`htasks create lane` adds a board column. `--name` is shown on the board; `--id` is the task status (default: slug of the name). `--prompt` is a file in `.herdr-tasks/prompts/` or inline text. `--next-step` is the lane to `htasks move` to when that step finishes (default `done`).
`htasks edit <id> --effort high` sets effort; `--effort none` clears it. Effort is applied to the agent command when the task moves to `in_progress`.
`htasks edit <id> --blockers id,id` sets blockers; `--blockers none` clears them.
`htasks edit <id> --worktree yes` marks the task to start in a git worktree on `<type>/<id>` (e.g. `feat/dev-11`) when it moves to `in_progress`.
A task cannot `move … in_progress` while any blocker is not `done`.
Lanes come from config (`backlog`, `in_progress`, `review`, `done`, plus any custom ids). Use `htasks move <id> <lane>`.

## Rules

- Start work with `htasks move <id> in_progress` (no-op if a pane is already attached).
- When implementation is complete: `htasks move <id> review` (or the in_progress lane's `next_step`).
- After a prompted lane finishes: `htasks move <id> <next_step>` (review's default is `done`).
- Do not create extra tasks unless asked.
- Do not kill Herdr panes.
- Do not guess agent binaries; unknown `agent` keys are errors.
