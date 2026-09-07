#!/usr/bin/env bash
# Shared validators and process-group watchdog helpers for parallel-review runners.
# shellcheck disable=SC2034,SC2154,SC2329

review_work_dir=''
review_attempt_cmd=()
review_timeout_label=''
review_child_pid=''
review_watchdog_pid=''
review_watchdog_timer_file=''
review_timeout_marker=''

review_common_die() {
	printf '%s\n' "$1" >&2
	exit "${2:-1}"
}

readonly REVIEW_SECRET_PATTERNS=(
	'.env*'
	'.envrc'
	'credentials*'
	'secrets*'
	'*.pem'
	'*.key'
	'*.p12'
	'*.pfx'
	'id_rsa'
	'id_ed25519'
)

readonly REVIEW_PRIVATE_KEY_HEADER_RE='^-----BEGIN (ENCRYPTED |RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----$'

review_resolve_path() {
	local path="$1"
	path="${path/#\~/$HOME}"
	if [[ ! -e "$path" ]]; then
		printf '%s\n' "$path"
		return 0
	fi
	realpath "$path"
}

review_fnmatch_part() {
	local part pattern
	part=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
	pattern=$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')
	# shellcheck disable=SC2254
	case "$part" in
	$pattern) return 0 ;;
	esac
	return 1
}

review_is_secret_path() {
	local value="$1"
	local cleaned part pattern
	cleaned="${value#"${value%%[![:space:]]*}"}"
	cleaned="${cleaned%"${cleaned##*[![:space:]]}"}"
	cleaned="${cleaned#\"}"
	cleaned="${cleaned%\"}"
	case "$cleaned" in
	a/*) cleaned="${cleaned#a/}" ;;
	esac
	case "$cleaned" in
	b/*) cleaned="${cleaned#b/}" ;;
	esac

	local IFS='/'
	local part
	for part in $cleaned; do
		[[ -z "$part" ]] && continue
		for pattern in "${REVIEW_SECRET_PATTERNS[@]}"; do
			if review_fnmatch_part "$part" "$pattern"; then
				return 0
			fi
		done
	done
	return 1
}

review_require_file() {
	local path="$1"
	local resolved
	resolved=$(review_resolve_path "$path")
	if [[ ! -f "$resolved" ]]; then
		review_common_die "input file not found: $path"
	fi
	if review_is_secret_path "$resolved"; then
		review_common_die "secret input path rejected: $path"
	fi
	printf '%s\n' "$resolved"
}

review_line_has_private_key_header() {
	local candidate="$1"
	candidate="${candidate#"${candidate%%[![:space:]]*}"}"
	candidate="${candidate%"${candidate##*[![:space:]]}"}"
	[[ "$candidate" =~ $REVIEW_PRIVATE_KEY_HEADER_RE ]]
}

review_check_line_private_key_marker() {
	local line="$1"
	local path="$2"

	if review_line_has_private_key_header "$line"; then
		review_common_die "private key marker rejected: $path"
	fi

	case "$line" in
	+* | -* | \ *)
		if review_line_has_private_key_header "${line:1}"; then
			review_common_die "private key marker rejected: $path"
		fi
		;;
	esac
}

review_validate_patch_metadata_line() {
	local line="$1"
	local -a paths=()
	local path rest word c old_path new_path
	local -a tokens=()
	local in_quote quote i changed_path

	if [[ "$line" == diff\ --git\ * ]]; then
		rest="${line#diff --git }"
		in_quote=0
		quote=''
		word=''
		for ((i = 0; i < ${#rest}; i++)); do
			c=${rest:i:1}
			if ((in_quote)); then
				if [[ "$c" == "$quote" ]]; then
					in_quote=0
					quote=''
				else
					word+=$c
				fi
			elif [[ "$c" == \" || "$c" == \' ]]; then
				in_quote=1
				quote=$c
			elif [[ "$c" == [[:space:]] ]]; then
				if [[ -n "$word" ]]; then
					tokens+=("$word")
					word=''
				fi
			else
				word+=$c
			fi
		done
		[[ -n "$word" ]] && tokens+=("$word")
		if ((${#tokens[@]} < 2)); then
			review_common_die "invalid diff header: $line"
		fi
		if ((${#tokens[@]} == 2)); then
			paths+=("${tokens[0]}" "${tokens[1]}")
		elif [[ "${tokens[0]}" == a/* && "$rest" == *" b/"* ]]; then
			old_path="${rest%" b/"*}"
			new_path="${rest#"$old_path" }"
			paths+=("$old_path" "$new_path")
		else
			review_common_die "invalid diff header: $line"
		fi
	elif [[ "$line" == ---\ * ]]; then
		path="${line#--- }"
		path="${path%%	*}"
		paths+=("$path")
	elif [[ "$line" == +++\ * ]]; then
		path="${line#+++ }"
		path="${path%%	*}"
		paths+=("$path")
	elif [[ "$line" == rename\ from\ * ]]; then
		path="${line#rename from }"
		path="${path%%	*}"
		paths+=("$path")
	elif [[ "$line" == rename\ to\ * ]]; then
		path="${line#rename to }"
		path="${path%%	*}"
		paths+=("$path")
	fi

	for changed_path in "${paths[@]}"; do
		[[ -z "$changed_path" ]] && continue
		if [[ "$changed_path" != /dev/null ]] && review_is_secret_path "$changed_path"; then
			review_common_die "secret path in patch rejected: $changed_path"
		fi
	done
}

review_validate_input() {
	local path="$1"
	local content line inspect_diff_paths in_hunk=0
	if ! content=$(cat "$path" 2>&1); then
		review_common_die "failed to read input: $path: $content"
	fi

	case "$path" in
	*.patch | *.PATCH | *.diff | *.DIFF) inspect_diff_paths=1 ;;
	*) inspect_diff_paths=0 ;;
	esac

	while IFS= read -r line || [[ -n "$line" ]]; do
		review_check_line_private_key_marker "$line" "$path"
		if ((inspect_diff_paths)); then
			case "$line" in
			diff\ --git\ *)
				in_hunk=0
				review_validate_patch_metadata_line "$line"
				;;
			@@\ *@@*)
				in_hunk=1
				;;
			---\ * | +++\ * | rename\ from\ * | rename\ to\ *)
				if ((in_hunk == 0)); then
					review_validate_patch_metadata_line "$line"
				fi
				;;
			esac
		fi
	done <<<"$content"
}

review_validate_timeout() {
	local value="$1"
	local message="${2:-timeout must be greater than zero}"
	if ! awk -v t="$value" 'BEGIN {
		if (t == "" || t !~ /^[0-9]+(\.[0-9]+)?$/) { exit 1 }
		if (t + 0 <= 0) { exit 1 }
		exit 0
	}'; then
		review_common_die "$message"
	fi
}

review_validate_attempts() {
	local value="$1"
	if ! awk -v t="$value" 'BEGIN {
		if (t == "" || t !~ /^[0-9]+$/) { exit 1 }
		if (t + 0 <= 0) { exit 1 }
		exit 0
	}'; then
		review_common_die "attempts must be a positive integer"
	fi
}

review_process_group_exists() {
	local pgid="$1"
	kill -0 -- "-$pgid" 2>/dev/null
}

review_stop_process_group() {
	local pgid="$1"
	local attempts=40

	kill -TERM -- "-$pgid" 2>/dev/null || true
	while review_process_group_exists "$pgid" && ((attempts > 0)); do
		sleep 0.05
		attempts=$((attempts - 1))
	done
	if review_process_group_exists "$pgid"; then
		kill -KILL -- "-$pgid" 2>/dev/null || true
	fi

	wait "$pgid" 2>/dev/null || true
}

review_cancel_watchdog() {
	local attempts=20
	local timer_pid=''

	if [[ -n "${review_watchdog_pid:-}" ]]; then
		while [[ ! -s "${review_watchdog_timer_file:-}" ]] && kill -0 "$review_watchdog_pid" 2>/dev/null && ((attempts > 0)); do
			sleep 0.01
			attempts=$((attempts - 1))
		done
		if [[ -s "${review_watchdog_timer_file:-}" ]]; then
			read -r timer_pid <"${review_watchdog_timer_file}"
			kill "$timer_pid" 2>/dev/null || true
		else
			kill "$review_watchdog_pid" 2>/dev/null || true
		fi
		wait "$review_watchdog_pid" 2>/dev/null || true
		review_watchdog_pid=''
	fi
	rm -f "${review_watchdog_timer_file:-}" "${review_timeout_marker:-}"
}

review_on_signal() {
	local exit_code="$1"
	review_cancel_watchdog
	if [[ -n "${review_child_pid:-}" ]]; then
		review_stop_process_group "$review_child_pid"
		review_child_pid=''
	fi
	exit "$exit_code"
}

review_run_one_attempt() {
	local attempt_timeout="$1"
	local status

	review_child_pid=''
	review_watchdog_pid=''
	review_timeout_marker="${review_work_dir}/timed-out"
	review_watchdog_timer_file="${review_work_dir}/watchdog-timer.pid"
	rm -f "$review_timeout_marker" "$review_watchdog_timer_file"

	set -m
	"${review_attempt_cmd[@]}" &
	review_child_pid=$!
	set +m

	(
		sleep "$attempt_timeout" &
		timer_pid=$!
		printf '%s\n' "$timer_pid" >"$review_watchdog_timer_file"
		if wait "$timer_pid" && review_process_group_exists "$review_child_pid"; then
			: >"$review_timeout_marker"
			review_stop_process_group "$review_child_pid"
		fi
	) 2>/dev/null &
	review_watchdog_pid=$!

	if wait "$review_child_pid"; then
		status=0
	else
		status=$?
	fi

	if [[ -f "$review_timeout_marker" ]]; then
		wait "$review_watchdog_pid" 2>/dev/null || true
		review_watchdog_pid=''
		review_child_pid=''
		rm -f "$review_timeout_marker"
		printf 'review timed out after %ss: %s\n' "$attempt_timeout" "${review_timeout_label:-review}" >&2
		return 124
	fi

	review_cancel_watchdog
	review_child_pid=''
	return "$status"
}
