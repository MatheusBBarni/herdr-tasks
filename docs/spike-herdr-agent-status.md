# Spike: agent status from Herdr

**Task:** `dev-13`  
**Herdr studied:** 0.8.2 (protocol 20)  
**Sources:** installed CLI (`herdr agent|pane|workspace|tab|api`), [Socket API](https://herdr.dev/docs/socket-api/), [Agents](https://herdr.dev/docs/agents/), [CLI reference](https://herdr.dev/docs/cli-reference/), [Plugins](https://herdr.dev/docs/plugins/), `herdr api schema --json`.

## Verdict

**Yes.** Herdr tracks a semantic agent lifecycle on every pane, and rolls it up to the tab and workspace. There is **no** `herdr subscribe` CLI. Push updates exist on the **socket API** (`events.subscribe`) and as **plugin event hooks**. The CLI only offers snapshots plus one-shot waits.

For an `in_progress` card, join the stored `herdr.pane_id` to that pane’s `agent_status`. Do **not** write the live status into task markdown. Do **not** treat Herdr `done` as “task finished.”

---

## 1. Does Herdr expose subscribe / status?

Three layers, same states:

| Layer | Push? | What it is | Use for htasks |
|---|---|---|---|
| CLI snapshot | No | `herdr agent get/list`, `pane get/list`, `tab get`, `workspace get` | Cheap poll from the TUI |
| CLI wait | One-shot | `herdr agent wait <target> [--until STATUS] [--timeout MS]` | Launch handshake (already used). Not a board stream |
| Socket API | Yes | `events.subscribe` + `events.wait` | Real-time board if we own a Unix-socket client |
| Plugin hooks | Yes, spawn | `[[events]] on = "pane.agent_status_changed"` | Only if htasks is a Herdr plugin. Spawns a process per event |

There is **no** subscribe at tab or workspace granularity. `events.subscribe` for agent status is **per pane**:

```json
{
  "id": "sub_1",
  "method": "events.subscribe",
  "params": {
    "subscriptions": [
      { "type": "pane.agent_status_changed", "pane_id": "w1:p1" }
    ]
  }
}
```

`pane_id` is required. Optional `agent_status` filters to one state (`idle` / `working` / `blocked` / `done` / `unknown`). The first line acknowledges; later NDJSON lines are pushed events (`pane.agent_status_changed` with `pane_id`, `workspace_id`, `agent_status`, optional `agent`, `display_agent`, `title`, `state_labels`).

Related pane events on the same socket: `pane.agent_detected`, `pane.updated`, `pane.exited`, `pane.closed`, `pane.moved`. After bootstrap, `session.snapshot` (`herdr api snapshot`) is a one-shot cache; it is not a subscription.

`events.wait` is a one-shot socket wait (`match_event` + optional `timeout_ms`). Same job as `herdr agent wait`, not a stream.

Plugin hooks fire on dotted names (`pane.agent_status_changed`). Payload is `HERDR_PLUGIN_EVENT_JSON`. They are **not** a live connection — Herdr execs the plugin command. Unusable for an OpenTUI board unless that command writes a file the TUI already watches.

CLI wrappers never keep a subscription open. Docs: “Most automation should start with the CLI. Use the raw socket API only when you need … long-lived event subscriptions.”

---

## 2. What status it exposes

Canonical enum (`AgentStatus`):

| Status | Meaning |
|---|---|
| `idle` | Agent is ready for input **and** its tab has been seen in the focused Herdr UI |
| `working` | Agent is busy |
| `blocked` | Herdr recognized an approval / question / permission UI |
| `done` | Same underlying idle as `idle`, but after **unseen** background work finished. Focusing the tab (or `agent focus` / pane focus) marks it seen → becomes `idle`. CLI reads do **not** mark seen |
| `unknown` | An agent is present but Herdr cannot classify it. **Not** proof of completion |

Roll-up (Herdr sidebar, also on `WorkspaceInfo` / `TabInfo`):

- A **blocked** agent makes pane, tab, and workspace look blocked.
- A **working** agent makes the workspace look active.
- A **done** agent stays visible until you view it.

htasks should display the **pane** status of the task’s stored `pane_id`, not the workspace roll-up. Extra splits in that workspace would otherwise paint the card with another agent’s state.

Live `herdr agent get` / `pane get` fields that matter:

```json
{
  "pane_id": "wP:pT",
  "workspace_id": "wP",
  "tab_id": "wP:tS",
  "agent": "pi",
  "name": null,
  "agent_status": "working",
  "display_agent": null,
  "title": null,
  "state_labels": {},
  "tokens": {},
  "focused": false,
  "interactive_ready": …,
  "launch_pending": …
}
```

`state_labels` / `tokens` / `display_agent` / `title` are **display-only** metadata (`pane.report_metadata`). They do not change waits or roll-ups. Optional extra on a card later (`$summary` style); not required for MVP.

Detection quality depends on the agent:

- Pi (with `herdr integration install pi`) reports lifecycle hooks → `idle` / `working` / `blocked` are authoritative.
- Screen-manifest agents (Claude, Codex, Grok, …) classify from the bottom-buffer snapshot. Unusual prompts can show `idle` instead of `blocked`.
- Unknown binaries may stay undetected → `agent get` fails; treat as gone / not an agent.

`herdr agent wait` defaults to `idle|done|blocked` (settled). `--until working` is explicit. Without `--timeout` it waits forever — never do that on the UI thread.

---

## 3. How to show it on an `in_progress` task

htasks already stores enough to join:

```yaml
herdr:
  workspace_id: wP
  pane_id: wP:pT
  agent_name: null
```

`launchInProgress` writes those IDs. The card already swaps meta to `starting…` while launch is in flight. Status is a **fourth, live** signal — keep it in TUI memory, not in `.herdr-tasks/tasks/*.md`.

### Recommended: poll `agent list` from the board

1. After the file watcher reloads tasks, collect `in_progress` tasks with a `pane_id`.
2. Off the UI thread (`Bun.spawn` / existing `HerdrRunner`), run `herdr agent list` once (not N× `agent get`).
3. Index by `pane_id`. Map each card:
   - launch in flight → keep `starting…`
   - pane in the list → show `agent_status` (`working`, `blocked`, `idle`, `done`, `unknown`)
   - pane missing / `pane get` fails → `gone` (layout closed or agent undetected)
4. Coalesce bursts (same pattern as `watchTasks`). Interval ~1–2s while the board is open; pause when a modal owns the screen if we want quieter I/O.
5. Card meta: `working  pi  herdr-tasks` (status, agent key, project basename). Truncate by cell width. Do not color-only: `NO_COLOR` / automatic color still needs the word.
6. Optional: `blocked` also in the toast. Do not auto-`htasks move … done` when Herdr says `done`.

Why poll first:

- No Unix-socket client, no Windows named-pipe branch, no invented Herdr flags.
- Matches current `src/lib/herdr.ts` (spawn CLI, parse JSON).
- `agent list` is already parsed there (`agentRecords` / `agentOnPane`).
- Board contract: never block the UI thread on Herdr.

### Later: socket subscribe

When polling is visibly laggy or we already talk to `$HERDR_SOCKET_PATH`:

1. `session.snapshot` (or `herdr api snapshot`) to seed.
2. One connection: `events.subscribe` with one `{ type: "pane.agent_status_changed", pane_id }` per in-progress card. Resubscribe when the in-progress set changes.
3. Also listen for `pane.closed` / `pane.exited` / `pane.moved` so `gone` and ID rewrites (`previous_pane_id`) stay correct.
4. Reconnect + snapshot on socket drop.

Do not mix this into `defaultRunner` (that helper waits for process exit; a subscription never exits).

### Plugin hook (not for the standalone board)

`[[events]] on = "pane.agent_status_changed"` only helps after htasks is a plugin (see `docs/spike-herdr-plugin.md`). Even then it is the wrong shape for a live overlay TUI: Herdr would spawn a command on every status tick. The overlay should subscribe or poll itself.

### CLI (`htasks list` / `show`)

Optional follow-up: `--json` could add `herdr_agent_status` for in-progress rows by the same `agent list` join. Keep it off the default human table until the TUI path is proven — extra Herdr RPC on every `list` is surprising when the server is down.

---

## 4. Mapping to `[herdr] behavior`

| behavior | Stored IDs | Status to show |
|---|---|---|
| `workspace` | `workspace_id` + root `pane_id` | Pane of `pane_id` (the launched agent) |
| `tab` | same + tab via `pane get` | Same pane |
| `pane` | split `pane_id` | Same pane |

Workspace/tab `agent_status` in `workspace get` / `tab get` is a **rollup**. Skip it for cards.

If `pane.moved` rewrites the public pane id, update `task.herdr.pane_id` from `.result.move_result.pane.pane_id` only if htasks itself moved the pane. We do not watch foreign moves in MVP; a missed move looks like `gone` until the user relaunches.

---

## 5. What not to do

- **Do not persist `agent_status` in task frontmatter.** Source of truth is Herdr. Writing it would fight the file watcher and go stale when the board is closed.
- **Do not treat Herdr `done` as board `done`.** `done` means “unseen idle.” The agent still must `htasks move <id> done`. Auto-moving would close the loop on a glance, not on finished work.
- **Do not `agent wait` per card on the UI thread.** Indefinite wait, one process per card.
- **Do not invent `herdr agent subscribe`.** It does not exist in 0.8.2.
- **Do not encode the same state four ways** on the card (color + icon + word + lane). Lane = board status; one extra word = Herdr lifecycle. `starting…` replaces that word during launch.

---

## 6. Suggested implementation order (if we build it)

1. `parseAgentStatus` next to `agentRecords` in `src/lib/herdr.ts`; unit-test against fixture `agent list` JSON.
2. TUI: in-memory `Map<pane_id, AgentStatus | "gone">`, async refresh, card meta line.
3. Pressure-test 80×24 / 60-col: status must truncate with the rest of the meta line.
4. Only then a socket subscriber behind the same Map.
5. Skip plugin hooks and auto-lane moves.

---

## 7. Answers to the task

- **If yes, how?** Snapshots: `herdr agent get <pane_id|name>` / `herdr agent list` (also on `pane` / `tab` / `workspace` get). One-shot: `herdr agent wait`. Push: socket `events.subscribe` with `type: "pane.agent_status_changed"` and a required `pane_id`; or a plugin `[[events]]` hook that Herdr execs. No CLI subscribe.
- **Show it on `in_progress` how?** Join `task.herdr.pane_id` to `agent list` off-thread, keep status in TUI memory, print one word on the card (`working` / `blocked` / `idle` / `done` / `unknown` / `gone`). Do not write it to markdown. Do not auto-complete the task.
- **What status?** `idle`, `working`, `blocked`, `done`, `unknown` — plus htasks-local `starting…` and `gone`.
