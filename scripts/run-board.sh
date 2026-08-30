#!/usr/bin/env bash
# Run the htasks TUI inside a Herdr plugin pane.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
compiled="$repo_root/dist/htasks"
entry="$repo_root/src/cli/htasks.ts"

if [ -x "$compiled" ]; then
  exec "$compiled" board
fi

if command -v bun >/dev/null 2>&1; then
  exec bun "$entry" board
fi

echo "run-board.sh: no compiled htasks at $compiled and bun is not on PATH" >&2
echo "run-board.sh: install Bun >= 1.3 (https://bun.sh) or reinstall the plugin so [[build]] can compile." >&2
exit 1
