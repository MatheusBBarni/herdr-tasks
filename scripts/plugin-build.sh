#!/usr/bin/env bash
# GitHub `herdr plugin install` build. `plugin link` does not run this.
#
# Prefer `bun build --compile` (one htasks binary). If the compile does not
# produce a runnable binary (OpenTUI native lib, missing Bun, …), fall back to
# `bun install` so `scripts/run-board.sh` can exec `bun src/cli/htasks.ts board`.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
cd "$repo_root"

if ! command -v bun >/dev/null 2>&1; then
  echo "plugin-build.sh: bun not found. Install Bun >= 1.3 from https://bun.sh" >&2
  exit 1
fi

mkdir -p "$repo_root/dist"
compiled="$repo_root/dist/htasks"

compile() {
  echo "plugin-build.sh: bun build --compile -> $compiled"
  bun build --compile --outfile "$compiled" src/cli/htasks.ts
  if [ ! -x "$compiled" ]; then
    echo "plugin-build.sh: compile did not produce $compiled" >&2
    return 1
  fi
  if ! "$compiled" --help >/dev/null 2>&1; then
    echo "plugin-build.sh: compiled binary failed --help" >&2
    return 1
  fi
  echo "plugin-build.sh: compile ok"
}

if compile; then
  exit 0
fi

echo "plugin-build.sh: compile failed; falling back to bun install" >&2
rm -f "$compiled"
bun install
echo "plugin-build.sh: bun install ok (run-board.sh will use bun)"
