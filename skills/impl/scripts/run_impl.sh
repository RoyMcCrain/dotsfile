#!/usr/bin/env bash
# Run one isolated Pi headless implementation with a private agent config directory.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
readonly SYSTEM_PROMPT="$SCRIPT_DIR/../references/system.md"
readonly EVENTS_HELPER="$SCRIPT_DIR/run_impl_events.ts"
readonly ROLE_SELECTOR="$SCRIPT_DIR/select_impl_role.ts"
readonly USAGE_COLLECTOR="$SCRIPT_DIR/query_impl_usage.ts"

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
	if ! rm -f -- "$dir/settings.json" "$dir/auth.json" "$dir/models.json" "$dir/models-store.json" \
		"$dir/files.txt" "$dir/task.md" "$dir/approval-lines" "$dir/approved.json"; then
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
       run_impl.sh --role impl.muse --share-with-meta --cwd WORKTREE --prompt PATH --files FILES

Runs an isolated Pi headless implementation. Default role is impl.default.
When --role is omitted and the active Pi model (PI_PROVIDER/PI_MODEL) is Meta Muse
Wonder or Muse Spark, the role is impl.muse, which still requires --share-with-meta,
--cwd, and --files. An explicit --role (including impl.default) always wins.
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

prepare_oss_inputs() {
	local prompt=$1 manifest=$2 cwd=$3 rel segment lower_segment canonical local_path result
	cp -- "$manifest" "$temp_config_dir/files.txt"
	cp -- "$prompt" "$temp_config_dir/task.md"
	chmod 600 "$temp_config_dir/files.txt" "$temp_config_dir/task.md"
	[[ -s "$temp_config_dir/task.md" ]] || die "prompt is empty"
	oss_check_content "$temp_config_dir/files.txt"
	oss_check_content "$temp_config_dir/task.md"
	: >"$temp_config_dir/approval-lines"
	while IFS= read -r rel || [[ -n "$rel" ]]; do
		[[ -n "$rel" && "$rel" =~ ^[A-Za-z0-9._/-]+$ && "$rel" != /* ]] || die "invalid approved manifest path"
		case "/$rel/" in */../* | */./*) die "invalid approved manifest path" ;; esac
		IFS=/ read -ra segments <<<"$rel"
		for segment in "${segments[@]}"; do
			lower_segment=$(printf '%s' "$segment" | tr '[:upper:]' '[:lower:]')
			case "$lower_segment" in .git | .jj | .pi | node_modules | .env* | auth* | credential* | secret* | key*) die "restricted path in approved manifest" ;; esac
		done
		review_is_secret_path "$rel" && die "restricted path in approved manifest"
		local_path="$cwd/$rel"
		[[ -f "$local_path" && ! -L "$local_path" ]] || die "approved paths must be regular non-link files"
		canonical=$(realpath "$local_path")
		[[ "$canonical" == "$cwd"/* && "$canonical" == "$local_path" ]] || die "symlinked or escaping approved path rejected"
		set +e
		rg --no-config -F -x -q -- "$canonical" "$temp_config_dir/approval-lines" >/dev/null 2>&1
		result=$?
		set -e
		case "$result" in 0) die "duplicate approved path" ;; 1) ;; *) die "manifest validation failed closed" ;; esac
		oss_check_content "$canonical"
		printf '%s\n' "$canonical" >>"$temp_config_dir/approval-lines"
	done <"$temp_config_dir/files.txt"
	[[ -s "$temp_config_dir/approval-lines" ]] || die "empty approved file manifest"
	jq -Rn '[inputs]' <"$temp_config_dir/approval-lines" >"$temp_config_dir/approved.json"
	chmod 600 "$temp_config_dir/approved.json"
	oss_warn_share
}

require_bun() {
	command -v bun >/dev/null 2>&1 || die "bun is required for implementation logging"
	[[ -f "$EVENTS_HELPER" ]] || die "events helper not found: $EVENTS_HELPER"
	[[ -f "$ROLE_SELECTOR" ]] || die "role selector not found: $ROLE_SELECTOR"
	[[ -f "$USAGE_COLLECTOR" ]] || die "usage collector not found: $USAGE_COLLECTOR"
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
	local source=$1 target=$2 role=$3 name original
	cat >"$target/settings.json" <<'EOF'
{"defaultProjectTrust":"never","enableInstallTelemetry":false}
EOF
	for name in auth.json models.json; do
		[[ "$role" != impl.muse || "$name" != models.json ]] || continue
		original="$source/$name"
		if [[ -f "$original" ]]; then
			ln -s "$original" "$target/$name"
		fi
	done
}

main() {
	local role='' prompt='' cwd='' prompt_path resolved_model='' source_config impl_bin status=0 usage_snapshot
	local share_with_meta=false files_input=''
	local haiku_model='' luna_model='' selected_role claude_code_extension=''
	local oss_extension=''
	local -a pi_command
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
		--share-with-meta)
			share_with_meta=true
			;;
		--files)
			shift
			[[ $# -gt 0 && -z "$files_input" && -n "$1" ]] || usage
			files_input=$1
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

	if [[ -z "$role" ]]; then
		case "${PI_PROVIDER:-}/${PI_MODEL:-}" in
		meta/muse-wonder-* | meta/muse-spark-*) role=impl.muse ;;
		*) role=impl.default ;;
		esac
	fi

	if [[ "$role" == impl.muse ]]; then
		[[ "$share_with_meta" == true ]] || die "impl.muse requires explicit --share-with-meta"
		[[ "$cwd_explicit" == true && -n "$files_input" ]] || die "impl.muse requires explicit --cwd and --files"
	else
		[[ "$share_with_meta" == false && -z "$files_input" ]] || die "--share-with-meta and --files require --role impl.muse"
	fi
	require_bun

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
	[[ "$role" != impl.muse || "$cwd" != / ]] || die "filesystem root is not an allowed worktree"
	if [[ "$role" == impl.muse && "$cwd" == *[[:cntrl:]]* ]]; then die "working directory contains control characters"; fi

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

	if [[ "$role" == impl.muse ]]; then
		# shellcheck disable=SC1091
		source "$SCRIPT_DIR/../../parallel-review/scripts/review_common.sh"
		# shellcheck disable=SC1091
		source "$SCRIPT_DIR/../../../scripts/oss-inputs.sh"
		local files_absolute
		prompt_path=$(review_require_file "$prompt_path")
		files_absolute=$(abs_path "$invocation_pwd" "$files_input")
		[[ -f "$files_absolute" && -r "$files_absolute" && ! -L "$files_absolute" ]] || die "approved manifest must be a readable regular file"
		temp_config_dir=$(mktemp -d "${TMPDIR:-/tmp}/pi-impl-config-XXXXXX")
		temp_config_dir=$(cd "$temp_config_dir" && pwd -P)
		chmod 700 "$temp_config_dir"
		trap cleanup_temp_config EXIT
		prepare_oss_inputs "$prompt_path" "$files_absolute" "$cwd"
		prompt_path="$temp_config_dir/task.md"
		oss_extension=$(realpath "$SCRIPT_DIR/../../../pi/agent/impl/approved-files.ts")
		[[ -f "$oss_extension" ]] || die "OSS approval extension not found"
		resolved_model=$(resolve_role_pi "$role")
		[[ "$resolved_model" =~ ^meta/[A-Za-z0-9._-]+-contributor(:(off|minimal|low|medium|high|xhigh|max))?$ ]] || die "OSS implementation role must resolve to a fixed Meta Contributor model"
	elif [[ "$role" == impl.default ]]; then
		haiku_model=$(resolve_role_pi impl.haiku)
		luna_model=$(resolve_role_pi impl.luna)
	else
		resolved_model=$(resolve_role_pi "$role")
	fi
	impl_bin=$(resolve_impl_bin)
	if [[ "$role" == impl.default ]]; then
		usage_snapshot=$(bun --config=/dev/null --no-env-file --no-install run "$USAGE_COLLECTOR") || die "failed to query implementation usage"
		selected_role=$(bun --config=/dev/null --no-env-file --no-install run "$ROLE_SELECTOR" "$runs_dir_resolved" "$usage_snapshot") || die "failed to select default implementation role"
		case "$selected_role" in
		impl.haiku)
			role=$selected_role
			resolved_model=$haiku_model
			;;
		impl.luna)
			role=$selected_role
			resolved_model=$luna_model
			;;
		*) die "role selector returned invalid role" ;;
		esac
	fi
	if [[ "$role" != impl.muse && "${resolved_model%%:*}" == meta/*-contributor ]]; then
		die "Meta Contributor models are reserved for role impl.muse"
	fi
	if [[ "$resolved_model" == claude-code/* ]]; then
		claude_code_extension=$(abs_path "$invocation_pwd" "${PI_CLAUDE_CODE_EXTENSION:-$source_config/git/github.com/earendil-works/pi-claude-code}")
		[[ -d "$claude_code_extension" ]] || die "pi-claude-code extension not found: $claude_code_extension (run: pi update --extensions)"
	fi

	if [[ -z "$temp_config_dir" ]]; then
		temp_config_dir=$(mktemp -d "${TMPDIR:-/tmp}/pi-impl-config-XXXXXX")
		temp_config_dir=$(cd "$temp_config_dir" && pwd -P)
		trap cleanup_temp_config EXIT
	fi
	make_isolated_config "$source_config" "$temp_config_dir" "$role"

	cd "$cwd" || die "working directory not found: $cwd"
	export PI_CODING_AGENT_DIR="$temp_config_dir" PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0

	pi_command=("$impl_bin" -p --mode json --model "$resolved_model" --system-prompt "$SYSTEM_PROMPT"
		--no-session --no-skills --no-prompt-templates --no-context-files --no-extensions --no-mcp --no-approve)
	if [[ "$role" == impl.muse ]]; then
		PI_OSS_APPROVED_FILES="$temp_config_dir/approved.json"
		export PI_OSS_APPROVED_FILES
		pi_command+=(--no-builtin-tools -e "$oss_extension")
	fi
	if [[ "$resolved_model" == claude-code/* ]]; then
		pi_command+=(-e "$claude_code_extension")
		export PI_CLAUDE_CODE_ALLOW_USAGE_CREDITS=0
	fi
	if [[ "$role" == impl.muse ]]; then
		pi_command+=("@$prompt_path" 'Implement only approved files; do not use tools beyond approved file access.')
	else
		pi_command+=(--tools 'read,bash,edit,write' "@$prompt_path" 'Implement the supplied task directly.')
	fi

	set +e
	bun --config=/dev/null --no-env-file --no-install run "$EVENTS_HELPER" \
		--runs-root "$runs_dir_resolved" \
		--role "$role" \
		--model "$resolved_model" \
		--prompt-path "$prompt_path" \
		--system-prompt-path "$SYSTEM_PROMPT" \
		--repository-path "$cwd" \
		-- "${pi_command[@]}"
	status=$?
	set -e

	exit "$status"
}

main "$@"
