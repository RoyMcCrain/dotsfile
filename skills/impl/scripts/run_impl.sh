#!/usr/bin/env bash
# Run one isolated Pi headless implementation with a private agent config directory.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
readonly SYSTEM_PROMPT="$SCRIPT_DIR/../references/system.md"
readonly EVENTS_HELPER="$SCRIPT_DIR/run_impl_events.ts"

die() {
	printf '%s\n' "$1" >&2
	exit "${2:-1}"
}

temp_config_dir=''
invocation_pwd=''

# shellcheck disable=SC2329 # Invoked by the EXIT trap.
cleanup_temp_config() {
	[[ -n "$temp_config_dir" && -d "$temp_config_dir" ]] || return 0
	local dir=$temp_config_dir
	if ! rm -f -- "$dir/settings.json" "$dir/auth.json" "$dir/models.json" "$dir/models-store.json"; then
		printf '%s\n' "run_impl.sh: warning: could not remove owned temp config files: $dir" >&2
	fi
	if rmdir "$dir" 2>/dev/null; then
		temp_config_dir=''
	else
		printf '%s\n' "run_impl.sh: warning: could not remove temp config directory (unexpected extra files?): $dir" >&2
	fi
}

usage() {
	cat >&2 <<'EOF'
Usage: run_impl.sh --prompt PATH [--cwd PATH] [--role ROLE] [--runs-dir PATH]

Runs an isolated Pi headless implementation. Default role is impl.default.
Implementation metrics are persisted under the runs directory (see IMPL_RUNS_DIR).
EOF
	exit 1
}

expand_home() { printf '%s\n' "${1/#\~/$HOME}"; }

abs_path() {
	local base=$1 path
	path=$(expand_home "$2")
	[[ "$path" == /* ]] || path="$base/$path"
	printf '%s\n' "$path"
}

resolve_existing_path() {
	local path=$1 label=$2 dir base
	[[ -e "$path" ]] || die "$label not found: $path"
	dir=$(cd "$(dirname "$path")" && pwd -P)
	printf '%s/%s\n' "$dir" "$(basename "$path")"
}

require_readable_nonempty_file() {
	local path=$1 label=$2
	if [[ ! -f "$path" || ! -r "$path" || ! -s "$path" ]]; then
		die "$label is missing, unreadable, or empty: $path"
	fi
}

require_deno() {
	command -v deno >/dev/null 2>&1 || die "deno is required for implementation logging"
	[[ -f "$EVENTS_HELPER" ]] || die "events helper not found: $EVENTS_HELPER"
}

default_runs_dir() {
	local base="${XDG_DATA_HOME:-$HOME/.local/share}"
	printf '%s\n' "$base/impl/runs"
}

prepare_runs_root() {
	local path=$1
	[[ -n "$path" ]] || die "runs directory path is empty"
	if [[ -e "$path" && ! -d "$path" ]]; then
		die "runs directory is not a directory: $path"
	fi
	local existed=false
	[[ -d "$path" ]] && existed=true
	if ! mkdir -p "$path"; then
		die "failed to create runs directory: $path"
	fi
	if [[ "$existed" == false ]]; then
		if ! chmod 0700 "$path" 2>/dev/null; then
			die "failed to set runs directory permissions: $path"
		fi
	fi
}

validate_resolved_model() {
	local model=$1 role=$2 provider rest
	[[ -n "$model" ]] || die "model role resolved to empty value: $role"
	if [[ "$model" == *[[:space:][:cntrl:]]* ]]; then
		die "invalid model id for role $role: contains whitespace or control characters"
	fi
	if [[ "$model" == *'*'* || "$model" == *'?'* ]]; then
		die "invalid model id for role $role: wildcard characters not allowed"
	fi
	provider=${model%%/*}
	rest=${model#*/}
	if [[ "$provider" == "$model" || -z "$provider" || -z "$rest" ]]; then
		die "invalid model id for role $role: $model"
	fi
}

resolve_role_pi() {
	local role=$1 resolver resolved
	[[ -n "$role" ]] || die "invalid empty role"
	resolver=$(abs_path "$invocation_pwd" "${MODEL_RESOLVER:-${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/resolve-model.sh}")
	[[ -x "$resolver" ]] || die "model resolver not found: $resolver"
	resolved=$("$resolver" --field pi "$role") || die "failed to resolve role: $role"
	validate_resolved_model "$resolved" "$role"
	printf '%s\n' "$resolved"
}

resolve_impl_bin() {
	local bin=${PI_IMPL_BIN:-pi} path
	if [[ "$bin" == */* ]]; then
		path=$(abs_path "$invocation_pwd" "$bin")
		[[ -x "$path" ]] || die "pi binary not found or not executable: $path"
		printf '%s\n' "$(cd "$(dirname "$path")" && pwd -P)/$(basename "$path")"
	else
		path=$(command -v "$bin" 2>/dev/null || true)
		[[ -n "$path" && -x "$path" ]] || die "pi binary not found or not executable: $bin"
		printf '%s\n' "$path"
	fi
}

make_isolated_config() {
	local source=$1 target=$2 name original
	cat >"$target/settings.json" <<'EOF'
{"defaultProjectTrust":"never","enableInstallTelemetry":false}
EOF
	for name in auth.json models.json; do
		original="$source/$name"
		if [[ -f "$original" ]]; then
			ln -s "$original" "$target/$name"
		fi
	done
}

main() {
	local role=impl.default prompt='' cwd='' prompt_path resolved_model source_config impl_bin status=0
	local cwd_explicit=false runs_dir='' runs_dir_resolved='' runs_dir_explicit=false

	invocation_pwd=$PWD

	while (($# > 0)); do
		case "$1" in
		--prompt)
			shift
			[[ $# -gt 0 ]] || usage
			prompt=$1
			;;
		--cwd)
			shift
			[[ $# -gt 0 ]] || usage
			cwd=$1
			cwd_explicit=true
			;;
		--role)
			shift
			[[ $# -gt 0 ]] || usage
			role=$1
			[[ -n "$role" ]] || die "invalid empty role"
			;;
		--runs-dir)
			shift
			[[ $# -gt 0 ]] || usage
			runs_dir=$1
			runs_dir_explicit=true
			;;
		-h | --help) usage ;;
		*) die "unknown argument: $1" ;;
		esac
		shift
	done

	require_deno

	[[ -n "$prompt" ]] || die "missing required argument: --prompt"
	prompt=$(expand_home "$prompt")
	if [[ "$prompt" == /* ]]; then
		prompt_path=$(resolve_existing_path "$prompt" "prompt")
	else
		prompt_path=$(resolve_existing_path "$invocation_pwd/$prompt" "prompt")
	fi
	require_readable_nonempty_file "$prompt_path" "prompt"

	if [[ "$cwd_explicit" == true ]]; then
		[[ -n "$cwd" ]] || die "invalid empty working directory"
	else
		cwd=$invocation_pwd
	fi
	cwd=$(expand_home "$cwd")
	[[ -d "$cwd" ]] || die "working directory not found: $cwd"
	cwd=$(cd "$cwd" && pwd -P)

	if [[ "$runs_dir_explicit" == true ]]; then
		runs_dir=$(expand_home "$runs_dir")
		[[ -n "$runs_dir" ]] || die "runs directory path is empty"
		if [[ "$runs_dir" == /* ]]; then
			runs_dir_resolved=$(cd "$(dirname "$runs_dir")" 2>/dev/null && pwd -P)/$(basename "$runs_dir") || runs_dir_resolved=$(abs_path "$invocation_pwd" "$runs_dir")
		else
			runs_dir_resolved=$(abs_path "$invocation_pwd" "$runs_dir")
		fi
	elif [[ -n "${IMPL_RUNS_DIR:-}" ]]; then
		runs_dir_resolved=$(abs_path "$invocation_pwd" "$(expand_home "$IMPL_RUNS_DIR")")
	else
		runs_dir_resolved=$(expand_home "$(default_runs_dir)")
	fi
	prepare_runs_root "$runs_dir_resolved"

	source_config=$(abs_path "$invocation_pwd" "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}")
	[[ -d "$source_config" ]] || die "source agent config directory not found: $source_config"
	source_config=$(cd "$source_config" && pwd -P)
	[[ -f "$SYSTEM_PROMPT" ]] || die "bundled system prompt not found: $SYSTEM_PROMPT"

	resolved_model=$(resolve_role_pi "$role")
	impl_bin=$(resolve_impl_bin)

	temp_config_dir=$(mktemp -d "${TMPDIR:-/tmp}/pi-impl-config-XXXXXX")
	trap cleanup_temp_config EXIT
	temp_config_dir=$(cd "$temp_config_dir" && pwd -P)
	make_isolated_config "$source_config" "$temp_config_dir"

	cd "$cwd" || die "working directory not found: $cwd"
	export PI_CODING_AGENT_DIR="$temp_config_dir" PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0

	local pi_allow=$impl_bin
	local runs_allow=$runs_dir_resolved
	local read_allow="$SCRIPT_DIR,$prompt_path,$SYSTEM_PROMPT,$cwd,$impl_bin"
	local deno_cache="${XDG_CACHE_HOME:-$HOME/.cache}/deno"
	local write_allow="$runs_allow,$deno_cache,${TMPDIR:-/tmp},stdout,stderr"
	local run_allow=$pi_allow
	local vcs_bin interp
	for vcs_bin in jj git; do
		if vcs_bin=$(command -v "$vcs_bin" 2>/dev/null); then
			run_allow="$run_allow,$vcs_bin"
		fi
	done
	for interp in bash sh env; do
		if interp=$(command -v "$interp" 2>/dev/null); then
			run_allow="$run_allow,$interp"
		fi
	done

	set +e
	deno run --no-config --no-prompt \
		--allow-run="$run_allow" \
		--allow-read="$read_allow,$runs_allow,$deno_cache" \
		--allow-write="$write_allow" \
		--allow-env \
		"$EVENTS_HELPER" \
		--runs-root "$runs_dir_resolved" \
		--role "$role" \
		--model "$resolved_model" \
		--prompt-path "$prompt_path" \
		--system-prompt-path "$SYSTEM_PROMPT" \
		--repository-path "$cwd" \
		-- \
		"$impl_bin" -p --mode json --model "$resolved_model" --system-prompt "$SYSTEM_PROMPT" \
		--no-session --no-skills --no-prompt-templates --no-context-files --no-extensions --no-mcp --no-approve \
		--tools read,bash,edit,write "@$prompt_path" 'Implement the supplied task directly.'
	status=$?
	set -e

	exit "$status"
}

main "$@"
