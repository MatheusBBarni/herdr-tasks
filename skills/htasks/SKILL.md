# htasks

Use **only** `htasks` to read and update tasks. Never edit `.herdr-tasks/tasks/*.md` by hand.

`htasks` is the board CLI. `herdr` is the multiplexer already running this pane. `.herdr-tasks` is the data dir.

## Commands

```bash
htasks root
htasks list --json
htasks show <id> --json
htasks create --title T [--description D] [--agent A] [--project P] [--status backlog]
htasks move <id> in_progress
htasks move <id> done
```

`create` covers the board form fields: `--title` (required), `--description`, `--agent` (config map key), `--project` (must exist). `--status` is CLI-only; default `backlog`. Prints the new id.

## Rules

- Start work with `htasks move <id> in_progress` (no-op if a pane is already attached).
- Finish with `htasks move <id> done`.
- Do not create extra tasks unless asked.
- Do not kill Herdr panes.
- Do not guess agent binaries; unknown `agent` keys are errors.
