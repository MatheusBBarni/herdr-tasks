# Things to improve or new features

Board tickets: **dev-37–dev-58** (backlog). Source: current `src/`, README, packaged skill, this board’s `config.toml`.

Not ticketed: WIP limits, tags/due dates/subtasks, command palette, undo, Windows plugin, MCP, auto-move on Herdr idle (rejected in `docs/spike-herdr-agent-status.md`).

## Bugs

| id | finding | evidence |
|---|---|---|
| dev-37 | `c` opens create unless the card is done *and* has a layout | `src/tui/app.tsx` (`n \|\| c` → `openCreate`) vs help/README (`n` new, `c` close) |
| dev-38 | mouse down sets `selectedId`; `j/k` then reorders | `onFocusTask` in `src/tui/app.tsx` |
| dev-39 | cards omit type; custom lanes render as `idle`; Herdr `done` looks like task done | `src/tui/components/card.tsx` vs AGENTS.md card contract |
| dev-40 | blockers only gate the literal `in_progress` lane | `src/lib/move.ts`, `createTask` |
| dev-41 | `htasks list` only colors the original four lanes | `printTaskTable` in `src/cli/htasks.ts` |

## Config, docs, packaging

| id | finding |
|---|---|
| dev-42 | every create rewrites `config.toml` (comments die); `next_id` has no lock |
| dev-43 | `init --agent` only allows claude/grok/codex/opencode |
| dev-44 | AGENTS.md points at missing `htasks-prompt.md`; packaged skill vs board skill vs README drift; `.index.json` documented but unused |
| dev-45 | `@opentui/*` and `typescript` are `latest`; no CI, LICENSE, CHANGELOG |
| dev-58 | `init` copies the skill once; existing boards keep a stale copy |

## Board and Herdr lifecycle

| id | finding |
|---|---|
| dev-46 | no delete/archive; done is unbounded |
| dev-47 | no relaunch when pane is `gone`; `c` only closes **done** |
| dev-48 | worktrees are never removed |
| dev-49 | `n` always creates in backlog |
| dev-50 | list is `--status` only; board `f` is per-lane |
| dev-52 | settings is theme/agent/behavior/bin/project only |
| dev-53 | description textarea; CLI `--description` replaces the whole body |
| dev-54 | no yank-id / jump |
| dev-55 | blocked agents are silent except the card word |
| dev-56 | optional `close_on_leave` (default still leave panes alive) |

## CLI

| id | finding |
|---|---|
| dev-51 | lane create exists; no edit/remove; no `projects add` |
| dev-57 | no `htasks duplicate` |
