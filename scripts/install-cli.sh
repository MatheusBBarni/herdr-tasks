#!/usr/bin/env bash
# Copy htasks onto PATH so agents can keep calling `htasks` after plugin install.
# `plugin link` does not run this; local authors use `bun link` / `bun run`.
#
# Destination: $HTASKS_CLI_INSTALL_DIR or ~/.local/bin
# Prefers dist/htasks from plugin-build.sh; otherwise a bun wrapper into this checkout.
set -euo pipefail

if [ "$#" -ne 0 ]; then
  echo "install-cli.sh: no arguments expected; set HTASKS_CLI_INSTALL_DIR to override the destination directory" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
compiled="$repo_root/dist/htasks"
entry="$repo_root/src/cli/htasks.ts"

if [ "${HTASKS_CLI_INSTALL_DIR+x}" = x ]; then
  if [ -z "$HTASKS_CLI_INSTALL_DIR" ]; then
    echo "install-cli.sh: HTASKS_CLI_INSTALL_DIR must not be empty" >&2
    exit 2
  fi
  install_dir="$HTASKS_CLI_INSTALL_DIR"
else
  if [ -z "${HOME:-}" ]; then
    echo "install-cli.sh: HOME must be set when HTASKS_CLI_INSTALL_DIR is not provided" >&2
    exit 2
  fi
  install_dir="$HOME/.local/bin"
fi

case "$install_dir" in
  /*) ;;
  *)
    echo "install-cli.sh: install directory must be an absolute path: $install_dir" >&2
    exit 1
    ;;
esac

mkdir -p -- "$install_dir"
destination="$install_dir/htasks"
marker="$install_dir/.htasks-cli-managed"

if { [ -e "$destination" ] || [ -L "$destination" ]; } && [ ! -f "$marker" ]; then
  echo "install-cli.sh: refusing to overwrite unmanaged destination: $destination" >&2
  echo "install-cli.sh: move it aside or set HTASKS_CLI_INSTALL_DIR to a different absolute directory" >&2
  exit 1
fi

temporary="$(mktemp "$install_dir/.htasks.XXXXXX")"
cleanup() {
  rm -f -- "$temporary"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

if [ -x "$compiled" ]; then
  cp -p -- "$compiled" "$temporary"
  chmod 0755 "$temporary"
else
  if [ ! -f "$entry" ]; then
    echo "install-cli.sh: no compiled binary at $compiled and source CLI missing at $entry" >&2
    echo "install-cli.sh: run scripts/plugin-build.sh first" >&2
    exit 1
  fi
  cat >"$temporary" <<EOF
#!/usr/bin/env bash
exec bun "$entry" "\$@"
EOF
  chmod 0755 "$temporary"
fi

mv -f -- "$temporary" "$destination"
printf 'htasks %s\n' "$repo_root" >"$marker"
trap - EXIT HUP INT TERM

echo "install-cli.sh: installed htasks at $destination"
echo "install-cli.sh: put $install_dir on PATH so agents can run htasks"
