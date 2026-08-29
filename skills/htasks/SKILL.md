# htasks

Use **only** `htasks` to read and update tasks. Never edit `.herdr-tasks/tasks/*.md` by hand.

`htasks` is the board CLI. `herdr` is the multiplexer already running this pane. `.herdr-tasks` is the data dir.

## Commands

```bash
htasks root
htasks list --json
htasks show <id> --json
htasks create --title T [--description D] [--type T] [--agent A] [--effort E] [--project P] [--status backlog] [--blockers id,id]
htasks move <id> in_progress
htasks move <id> done
```

`create` covers the board form fields: `--title` (required), `--description`, `--type` (from config `task_types`), `--agent` (config map key), `--effort` (`low`, `medium`, `high`, `xhigh`, `max`), `--project` (must exist), `--blockers` (comma-separated task ids). `--status` is CLI-only; default `backlog`. Prints the new id.
`htasks edit <id> --effort high` sets effort; `--effort none` clears it. Effort is applied to the agent command when the task moves to `in_progress`.
`htasks edit <id> --blockers id,id` sets blockers; `--blockers none` clears them.
A task cannot `move … in_progress` while any blocker is not `done`.

## Rules

- Start work with `htasks move <id> in_progress` (no-op if a pane is already attached).
- Finish with `htasks move <id> done`.
- Do not create extra tasks unless asked.
- Do not kill Herdr panes.
- Do not guess agent binaries; unknown `agent` keys are errors.
