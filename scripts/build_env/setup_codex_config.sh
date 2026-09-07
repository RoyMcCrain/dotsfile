#!/usr/bin/env bash
# Initialize or migrate local Codex config at ${CODEX_HOME:-$HOME/.codex}/config.toml.
# Usage: setup_codex_config.sh [--migrate-legacy] [REPO_ROOT]
set -euo pipefail

die() {
	printf '%s\n' "$1" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Usage: setup_codex_config.sh [--migrate-legacy] [REPO_ROOT]

Initialize local Codex config when missing. Legacy repo symlink migration requires
--migrate-legacy after stopping all Codex apps, CLIs, and other config writers.

Options:
  --migrate-legacy  Detach ~/.codex/config.toml from the legacy repo symlink into a
                    regular local file. Run only while all config writers are stopped.
  --help, -h        Show this help.

Lock: mutating operations serialize on ${CODEX_HOME:-$HOME/.codex}/.config-setup.lock.
If setup fails with a stale lock, confirm no helper is active and no config writers are
running, then remove the empty lock directory.
EOF
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
default_repo_root=$(cd "${script_dir}/../.." && pwd -P)

migrate_legacy=false
repo_root=""

while [[ $# -gt 0 ]]; do
	case "$1" in
	--migrate-legacy)
		migrate_legacy=true
		shift
		;;
	--help | -h)
		usage
		exit 0
		;;
	--*)
		die "unknown option: $1 (try --help)"
		;;
	*)
		if [[ -n "$repo_root" ]]; then
			die "unexpected argument: $1 (try --help)"
		fi
		repo_root=$1
		shift
		;;
	esac
done

repo_root=${repo_root:-"$default_repo_root"}

template="${repo_root}/codex/config.toml.example"
legacy_config="${repo_root}/codex/config.toml"
resolver="${repo_root}/pi/agent/resolve-model.sh"
codex_home="${CODEX_HOME:-"$HOME/.codex"}"
target="${codex_home}/config.toml"
lock_dir="${codex_home}/.config-setup.lock"

owned_stage_dir=
owned_lock=false

cleanup_owned_stage() {
	if [[ -n "${owned_stage_dir:-}" && -d "$owned_stage_dir" ]]; then
		rm -f "${owned_stage_dir}/config.toml"
		if ! rmdir "$owned_stage_dir" 2>/dev/null; then
			printf 'warning: failed to remove staging directory %s\n' "$owned_stage_dir" >&2
		fi
		owned_stage_dir=
	fi
}

release_lock() {
	if [[ "$owned_lock" == true ]]; then
		if ! rmdir "$lock_dir" 2>/dev/null; then
			printf 'warning: failed to remove setup lock %s\n' "$lock_dir" >&2
		fi
		owned_lock=false
	fi
}

cleanup() {
	cleanup_owned_stage
	release_lock
}
trap cleanup EXIT

canonical_path() {
	realpath "$1"
}

acquire_lock() {
	if ! mkdir "$lock_dir" 2>/dev/null; then
		die "Codex config setup already in progress (lock: $lock_dir). Stop all Codex config writers, confirm no setup helper is active, then remove the empty lock directory if it is stale."
	fi
	owned_lock=true
}

is_legacy_symlink() {
	local link=$1
	[[ -L "$link" ]] || return 1
	[[ -f "$legacy_config" ]] || return 1
	[[ "$(canonical_path "$link")" == "$(canonical_path "$legacy_config")" ]]
}

legacy_symlink_refusal() {
	local quoted_helper quoted_root
	quoted_helper=$(printf '%q' "${script_dir}/$(basename "$0")")
	quoted_root=$(printf '%q' "$repo_root")
	die "legacy Codex config symlink detected at $target -> $(readlink "$target"). Stop all Codex apps, CLIs, and other config writers, then run: bash $quoted_helper --migrate-legacy $quoted_root"
}

migrate_legacy_symlink() {
	local link=$1
	local staged legacy_abs

	acquire_lock

	[[ -L "$link" ]] || die "expected symlink at $link"
	[[ -f "$legacy_config" ]] || die "legacy config missing: $legacy_config (restore from backup or VCS history before migrating)"
	legacy_abs=$(canonical_path "$legacy_config")

	owned_stage_dir=$(mktemp -d "${codex_home}/.config-setup.XXXXXX") || die "mktemp failed"
	chmod 700 "$owned_stage_dir"
	staged="${owned_stage_dir}/config.toml"

	cp -- "$legacy_config" "$staged"
	chmod 600 "$staged"

	if ! cmp -s "$legacy_config" "$staged"; then
		die "legacy config changed during migration (stop all Codex config writers and retry)"
	fi
	if ! [[ -L "$link" ]]; then
		die "symlink changed during migration: $link"
	fi
	if [[ "$(canonical_path "$link")" != "$legacy_abs" ]]; then
		die "symlink target changed during migration: $link"
	fi

	mv -f "$staged" "$link"
	rmdir "$owned_stage_dir"
	owned_stage_dir=

	printf 'migrated legacy Codex config symlink to %s\n' "$target"
}

install_new_config() {
	local model_id staged

	acquire_lock

	[[ ! -e "$target" ]] || die "config already exists: $target"

	[[ -f "$template" ]] || die "template missing: $template"
	[[ -f "$resolver" ]] || die "resolver missing: $resolver"

	export MODEL_ROLES_FILE="${MODEL_ROLES_FILE:-${repo_root}/pi/agent/model-roles.json}"
	model_id=$(bash "$resolver" --field id codex.default) ||
		die "failed to resolve codex.default model id"

	owned_stage_dir=$(mktemp -d "${codex_home}/.config-setup.XXXXXX") || die "mktemp failed"
	chmod 700 "$owned_stage_dir"
	staged="${owned_stage_dir}/config.toml"

	{
		printf 'model = "%s"\n' "$model_id"
		cat "$template"
	} >"$staged"
	chmod 600 "$staged"

	if ! ln "$staged" "$codex_home/"; then
		die "could not initialize Codex config: $target"
	fi

	rm -f "$staged"
	rmdir "$owned_stage_dir"
	owned_stage_dir=

	printf 'initialized Codex config at %s\n' "$target"
}

main() {
	mkdir -p "$codex_home"

	if [[ -f "$target" && ! -L "$target" ]]; then
		printf 'skipped: existing Codex config at %s\n' "$target"
		return 0
	fi

	if [[ -L "$target" ]]; then
		if [[ -d "$target" ]]; then
			die "Codex config symlink points to a directory: $target"
		fi
		if ! [[ -e "$target" ]]; then
			die "broken Codex config symlink: $target (restore from backup or inspect a known old revision; do not reinitialize from template)"
		fi
		if is_legacy_symlink "$target"; then
			if [[ "$migrate_legacy" != true ]]; then
				legacy_symlink_refusal
			fi
			migrate_legacy_symlink "$target"
			return 0
		fi
		printf 'skipped: unrelated Codex config symlink at %s\n' "$target"
		return 0
	fi

	if [[ -d "$target" ]]; then
		die "Codex config path is a directory: $target"
	fi

	if [[ -e "$target" ]]; then
		die "unexpected Codex config path: $target"
	fi

	if [[ "$migrate_legacy" == true ]]; then
		die "no legacy Codex config symlink to migrate at $target (--migrate-legacy does not initialize defaults)"
	fi

	install_new_config
}

main
