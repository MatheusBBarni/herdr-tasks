# htasks

Use **only** `htasks` to read and update tasks. Never edit `.herdr-tasks/tasks/*.md` by hand.

`htasks` is the board CLI. `herdr` is the multiplexer already running this pane. `.herdr-tasks` is the data dir.

## Commands

```bash
htasks root
htasks list --json
htasks show <id> --json
htasks move <id> in_progress
htasks move <id> done
```

## Rules

- Start work with `htasks move <id> in_progress` (no-op if a pane is already attached).
- Finish with `htasks move <id> done`.
- Do not create extra tasks unless asked.
- Do not kill Herdr panes.
- Do not guess agent binaries; unknown `agent` keys are errors.
