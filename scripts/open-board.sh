#!/usr/bin/env bash
# Open / focus / toggle the htasks overlay (herdr-board pattern).
#
#   no htasks pane in this workspace  -> plugin pane open (overlay, focused)
#   pane exists, unfocused            -> plugin pane focus
#   pane is focused                   -> close it
#
# Identifies the pane by title `htasks`. Uses $HERDR_BIN_PATH.
# Passes workspace/worktree cwd into the pane and sets HTASKS_ROOT when a board
# is found. Any decision failure degrades to OPEN.
set -uo pipefail

herdr_bin="${HERDR_BIN_PATH:-herdr}"
plugin_id="${HERDR_PLUGIN_ID:-htasks}"

context_cwd() {
  if ! command -v python3 >/dev/null 2>&1; then
    return 0
  fi
  python3 -c '
import json, os, sys
raw = os.environ.get("HERDR_PLUGIN_CONTEXT_JSON") or ""
if not raw.strip():
    sys.exit(0)
try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)
if not isinstance(data, dict):
    sys.exit(0)
workspace = data.get("workspace") if isinstance(data.get("workspace"), dict) else {}
worktree = data.get("worktree") if isinstance(data.get("worktree"), dict) else {}
if not worktree and isinstance(workspace.get("worktree"), dict):
    worktree = workspace["worktree"]
pane = data.get("pane") if isinstance(data.get("pane"), dict) else {}
if not pane and isinstance(data.get("focused_pane"), dict):
    pane = data["focused_pane"]
for obj, keys in (
    (worktree, ("checkout_path", "path", "cwd", "repo_root")),
    (workspace, ("cwd", "path", "root")),
    (pane, ("foreground_cwd", "cwd")),
    (data, ("cwd",)),
):
    for key in keys:
        value = obj.get(key)
        if isinstance(value, str) and value.strip():
            sys.stdout.write(value.strip())
            sys.exit(0)
'
}

find_board_root() {
  local dir="${1:-}"
  [ -n "$dir" ] || return 1
  dir="$(cd "$dir" 2>/dev/null && pwd)" || return 1
  while [ -n "$dir" ]; do
    if [ -f "$dir/.herdr-tasks/config.toml" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
    local parent
    parent="$(dirname "$dir")"
    [ "$parent" = "$dir" ] && break
    dir="$parent"
  done
  return 1
}

pane_cwd="$(context_cwd || true)"
if [ -z "$pane_cwd" ] && [ -n "${HERDR_PANE_ID:-}" ]; then
  pane_cwd="$("$herdr_bin" pane get "$HERDR_PANE_ID" 2>/dev/null | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
result = data.get("result", data) if isinstance(data, dict) else {}
pane = result.get("pane", result) if isinstance(result, dict) else {}
for key in ("foreground_cwd", "cwd"):
    value = pane.get(key) if isinstance(pane, dict) else None
    if isinstance(value, str) and value.strip():
        sys.stdout.write(value.strip())
        break
' 2>/dev/null || true)"
fi

board_root=""
if [ -n "$pane_cwd" ]; then
  board_root="$(find_board_root "$pane_cwd" || true)"
fi

open_pane() {
  local args=("$herdr_bin" plugin pane open --plugin "$plugin_id" --entrypoint board --placement overlay --focus)
  if [ -n "$pane_cwd" ]; then
    args+=(--cwd "$pane_cwd")
  fi
  if [ -n "$board_root" ]; then
    args+=(--env "HTASKS_ROOT=$board_root")
  elif [ -n "$pane_cwd" ]; then
    args+=(--env "HTASKS_ROOT=$pane_cwd")
  fi
  # Overlay/popup panes target the active pane; --workspace is invalid here.
  exec "${args[@]}"
}

is_board_pane() {
  python3 -c '
import json, os, re, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print("OPEN"); sys.exit(0)
res = data.get("result", data)
panes = res.get("panes", []) if isinstance(res, dict) else []
ws = os.environ.get("HERDR_WORKSPACE_ID") or ""
board = None
for p in panes:
    if not isinstance(p, dict):
        continue
    if ws and p.get("workspace_id") and str(p.get("workspace_id")) != ws:
        continue
    names = [
        p.get("title"),
        p.get("label"),
        p.get("name"),
        p.get("terminal_title_stripped"),
        p.get("terminal_title"),
    ]
    plugin = str(p.get("plugin_id") or p.get("plugin") or "")
    entry = str(p.get("entrypoint") or p.get("plugin_entrypoint") or "")
    hit = plugin == "htasks"
    for name in names:
        if isinstance(name, str) and (name == "htasks" or name.startswith("htasks ")):
            hit = True
            break
    if hit:
        board = p
        break
if not board:
    print("OPEN"); sys.exit(0)
pid = board.get("pane_id") or ""
if not pid:
    print("OPEN"); sys.exit(0)
if board.get("focused"):
    print("CLOSE " + str(pid))
else:
    print("FOCUS " + str(pid))
'
}

decision="OPEN"
if command -v python3 >/dev/null 2>&1; then
  list_args=(pane list)
  if [ -n "${HERDR_WORKSPACE_ID:-}" ]; then
    list_args+=(--workspace "$HERDR_WORKSPACE_ID")
  fi
  panes="$("$herdr_bin" "${list_args[@]}" 2>/dev/null || true)"
  if [ -n "$panes" ]; then
    decision="$(printf '%s' "$panes" | is_board_pane 2>/dev/null || echo OPEN)"
  fi
fi

case "$decision" in
  "FOCUS "*)
    pid="${decision#FOCUS }"
    if "$herdr_bin" plugin pane focus "$pid"; then
      exit 0
    fi
    ;;
  "CLOSE "*)
    pid="${decision#CLOSE }"
    if "$herdr_bin" plugin pane close "$pid" 2>/dev/null; then
      exit 0
    fi
    if "$herdr_bin" pane close "$pid"; then
      exit 0
    fi
    ;;
esac

open_pane
