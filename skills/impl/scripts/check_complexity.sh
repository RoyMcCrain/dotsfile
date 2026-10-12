#!/usr/bin/env bash
set -euo pipefail

COG_WARN=10
CYC_WARN=8
COG_HARD=15
CYC_HARD=10

usage() {
	echo "usage: check_complexity.sh [--phase before|after|check] [--case CASE] [--log-dir DIR] [--] FILE..." >&2
	echo "Measure cognitive/cyclomatic complexity via cccc (warn: cognitive>${COG_WARN}, cyclomatic>${CYC_WARN}; hard fail: cognitive>${COG_HARD}, cyclomatic>${CYC_HARD})." >&2
}

if ! command -v jq >/dev/null 2>&1; then
	echo "error: jq is required in PATH" >&2
	exit 2
fi

phase=check
case_id=
log_dir=
while [[ $# -gt 0 ]]; do
	case $1 in
	--phase)
		[[ $# -ge 2 && $2 =~ ^(before|after|check)$ ]] || {
			usage
			exit 2
		}
		phase=$2
		shift 2
		;;
	--case)
		[[ $# -ge 2 && $2 =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || {
			usage
			exit 2
		}
		case_id=$2
		shift 2
		;;
	--log-dir)
		[[ $# -ge 2 && -n $2 ]] || {
			usage
			exit 2
		}
		log_dir=$2
		shift 2
		;;
	--)
		shift
		break
		;;
	-*)
		usage
		exit 2
		;;
	*) break ;;
	esac
done
if [[ $# -eq 0 ]]; then
	usage
	exit 2
fi

overall_exit=0
results='[]'

add_unverified() {
	results=$(jq -c --arg path "$1" --arg reason "$2" '. + [{path:$path, verdict:"unverified", reason:$reason, functions:[]}]' <<<"$results")
}

mark_unverified() {
	local display_path=$1
	local input_key=$2
	local message=$3
	local reason_code=$4
	printf 'UNVERIFIED: %s: %s\n' "$display_path" "$message" >&2
	add_unverified "$input_key" "$reason_code"
	overall_exit=2
}

mark_hard_violation() {
	if [[ "$overall_exit" -ne 2 ]]; then
		overall_exit=1
	fi
}

json_valid_filter='
	def is_nonneg_int: type == "number" and (. == floor) and . >= 0;
	def is_pos_int: type == "number" and (. == floor) and . >= 1;

	type == "object"
	and (.files | type) == "array"
	and (.summary | type) == "object"
	and (.summary.file_count | is_nonneg_int)
	and (.summary.parse_error_count | is_nonneg_int)
	and (.summary.file_count == (.files | length))
	and (.summary.file_count == 0 or .summary.file_count == 1)
	and (.files | all(
		(.functions | type) == "array"
		and (.functions | all(
			(.name | type) == "string"
			and (.line | is_pos_int)
			and (.cognitive | is_nonneg_int)
			and (.cyclomatic | is_nonneg_int)
		))
	))
'

# These variables are expanded by jq, not the shell.
# shellcheck disable=SC2016
render_filter='
	def limit_tag($label): if $label == "ERROR" then "hard limit" else "limit" end;

	def threshold_line($label; $cog_limit; $cyc_limit):
		. as $fn
		| ($fn.cognitive > $cog_limit) as $cog_over
		| ($fn.cyclomatic > $cyc_limit) as $cyc_over
		| if ($cog_over | not) and ($cyc_over | not) then empty
			else
				"\($label): \($path):\($fn.line) \($fn.name) "
				+ (
					[
						(if $cog_over then "cognitive=\($fn.cognitive) > \($cog_limit) (\(limit_tag($label)) \($cog_limit))" else empty end),
						(if $cyc_over then "cyclomatic=\($fn.cyclomatic) > \($cyc_limit) (\(limit_tag($label)) \($cyc_limit))" else empty end)
					] | join("; ")
				)
			end;

	([.files[].functions | length] | add // 0) as $func_count
	| "MEASURED: \($path) (\($func_count) functions)",
	(.files[] | .functions[] | "  \($path):\(.line) \(.name) cognitive=\(.cognitive) cyclomatic=\(.cyclomatic)"),
	(.files[] | .functions[] | threshold_line("WARNING"; $cog_warn; $cyc_warn)),
	(.files[] | .functions[] | threshold_line("ERROR"; $cog_hard; $cyc_hard))
'

invocation_cwd=$(pwd -P)

normalize_input_key() {
	local input=$1 path component candidate
	if [[ "$input" == /* ]]; then path=/; else path=$invocation_cwd; fi
	local rest=$input
	while [[ -n $rest ]]; do
		component=${rest%%/*}
		if [[ $rest == */* ]]; then rest=${rest#*/}; else rest=; fi
		case $component in
		'' | .) continue ;;
		..)
			path=${path%/*}
			[[ -n $path ]] || path=/
			;;
		*)
			candidate=${path%/}/$component
			if [[ -e $candidate || -L $candidate ]]; then
				if [[ -d $candidate ]]; then
					path=$(cd -P -- "$candidate" 2>/dev/null && pwd -P) || path=$candidate
				elif command -v realpath >/dev/null 2>&1; then
					path=$(realpath "$candidate" 2>/dev/null) || path=$candidate
				else path=$candidate; fi
			else path=$candidate; fi
			;;
		esac
	done
	printf '%s\n' "$path"
}

for input in "$@"; do
	input_key=$(normalize_input_key "$input")
	if [[ ! -f "$input" ]]; then
		mark_unverified "$input" "$input_key" "missing or not a regular file" missing_input
		continue
	fi

	# Apply limits to validated JSON to keep tool failures distinct from violations.
	if ! command -v cccc >/dev/null 2>&1; then
		echo "error: cccc is required in PATH (install: devbox global run setup-cccc)" >&2
		mark_unverified "$input" "$input_key" "cccc missing or failed" cccc_missing
		continue
	fi
	if ! json=$(cccc --no-config --no-cache --no-ignore -- "$input"); then
		mark_unverified "$input" "$input_key" "cccc failed" cccc_failed
		continue
	fi

	if ! jq -se "length == 1 and (.[0] | $json_valid_filter)" <<<"$json" >/dev/null 2>&1; then
		mark_unverified "$input" "$input_key" "invalid or unexpected JSON from cccc" invalid_report
		continue
	fi

	file_count=$(jq -r '.summary.file_count' <<<"$json")
	parse_errors=$(jq -r '.summary.parse_error_count' <<<"$json")

	if [[ "$file_count" == "0" ]]; then
		mark_unverified "$input" "$input_key" "zero measured files (unsupported language or unanalysed input)" unmeasured_input
		continue
	fi

	if [[ "$parse_errors" != "0" ]]; then
		mark_unverified "$input" "$input_key" "parse errors (count=${parse_errors})" parse_errors
		continue
	fi

	if ! jq -r \
		--arg path "$input" \
		--argjson cog_warn "$COG_WARN" \
		--argjson cyc_warn "$CYC_WARN" \
		--argjson cog_hard "$COG_HARD" \
		--argjson cyc_hard "$CYC_HARD" \
		"$render_filter" <<<"$json"; then
		mark_unverified "$input" "$input_key" "failed to render complexity metrics" render_failed
		continue
	fi

	if ! hard_count=$(jq -r \
		--argjson cog_hard "$COG_HARD" \
		--argjson cyc_hard "$CYC_HARD" \
		'[.files[].functions[] | select(.cognitive > $cog_hard or .cyclomatic > $cyc_hard)] | length' \
		<<<"$json"); then
		mark_unverified "$input" "$input_key" "failed to evaluate hard complexity limits" limit_evaluation_failed
		continue
	fi
	file_verdict=pass
	if [[ "$hard_count" -gt 0 ]]; then
		file_verdict=error
		mark_hard_violation
	elif jq -e --argjson cw "$COG_WARN" --argjson yw "$CYC_WARN" '[.files[].functions[] | select(.cognitive > $cw or .cyclomatic > $yw)] | length > 0' <<<"$json" >/dev/null; then
		file_verdict=warning
	fi
	results=$(jq -c --arg path "$input_key" --arg verdict "$file_verdict" '. + [{path:$path,verdict:$verdict,functions:input}]' <<<"$results"$'\n'"$(jq -c '[.files[].functions[] | {name,line,cognitive,cyclomatic}]' <<<"$json")")
done

if [[ "$overall_exit" -eq 2 ]]; then
	verdict=unverified
elif [[ "$overall_exit" -eq 1 ]]; then
	verdict=error
elif jq -e 'any(.[]; .verdict == "warning")' <<<"$results" >/dev/null; then
	verdict=warning
else verdict=pass; fi

if [[ -z "$log_dir" ]]; then log_dir=${CCCC_LOG_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/impl/complexity}; fi
while [[ "$log_dir" != / && "$log_dir" == */ ]]; do log_dir=${log_dir%/}; done
if [[ -L "$log_dir" ]]; then
	echo "error: unsafe cccc log storage" >&2
	exit 2
fi
[[ "$log_dir" == /* ]] || log_dir=$invocation_cwd/$log_dir
log_dir=$(normalize_input_key "$log_dir")

stat_owner_mode() {
	local metadata
	if metadata=$(stat -c '%u %a' "$1" 2>/dev/null); then
		:
	elif metadata=$(stat -f '%u %Op' "$1" 2>/dev/null); then
		:
	else return 1; fi
	[[ "$metadata" =~ ^([0-9]+)[[:space:]]+([0-7]{3,6})$ ]] || return 1
	STAT_OWNER=${BASH_REMATCH[1]}
	STAT_MODE=$((8#${BASH_REMATCH[2]}))
}

trusted_directory() {
	local path=$1 is_root=${2:-0} owner mode writable sticky
	stat_owner_mode "$path" || return 1
	owner=$STAT_OWNER mode=$STAT_MODE
	if [[ "$is_root" -eq 1 ]]; then
		[[ "$owner" == "$EUID" ]] || return 1
	else
		[[ "$owner" == "$EUID" || "$owner" == 0 ]] || return 1
	fi
	writable=$((mode & 0022))
	((writable == 0)) && return 0
	sticky=$((mode & 01000))
	[[ "$is_root" -eq 0 && "$sticky" -ne 0 ]]
}

validate_existing_tree() {
	local path=$1 root=$2 current=/ part rest=${1#/}
	while [[ -n "$rest" ]]; do
		part=${rest%%/*}
		if [[ "$rest" == */* ]]; then rest=${rest#*/}; else rest=; fi
		[[ -n "$part" ]] || continue
		current=${current%/}/$part
		trusted_directory "$current" "$([[ "$current" == "$root" ]] && printf 1 || printf 0)" || return 1
	done
}

existing=$log_dir
while [[ ! -d "$existing" ]]; do
	existing=$(dirname -- "$existing") || exit 2
done
physical_existing=$(cd -P -- "$existing" 2>/dev/null && pwd -P) || {
	echo "error: unsafe cccc log storage" >&2
	exit 2
}
validate_existing_tree "$physical_existing" "" || {
	echo "error: unsafe cccc log storage" >&2
	exit 2
}
root_existed=0
[[ -e "$log_dir" ]] && root_existed=1
if ! (umask 077 && mkdir -p -- "$log_dir") 2>/dev/null; then
	echo "error: cannot create cccc log root" >&2
	exit 2
fi
physical_root=$(cd -P -- "$log_dir" 2>/dev/null && pwd -P) || {
	echo "error: unsafe cccc log storage" >&2
	exit 2
}
if [[ "$root_existed" -eq 0 ]] && ! chmod 700 "$physical_root"; then
	echo "error: unsafe cccc log storage" >&2
	exit 2
fi
if ! validate_existing_tree "$physical_root" "$physical_root" || ! trusted_directory "$physical_root" 1; then
	echo "error: unsafe cccc log storage" >&2
	exit 2
fi
log_dir=$physical_root
# Existing history roots are never chmodded.
log_run=$(mktemp -d "$log_dir/check.XXXXXXXX" 2>/dev/null) || {
	echo "error: cannot create cccc log entry" >&2
	exit 2
}
chmod 700 "$log_run" || {
	echo "error: cannot secure cccc log entry" >&2
	exit 2
}
repo=$invocation_cwd
revision=unknown
revision_kind=unknown
if jj_root=$(jj root 2>/dev/null); then
	repo=$jj_root
	revision=$(jj log --no-graph -r @ -T 'commit_id' 2>/dev/null || printf unknown)
	revision_kind=jj
elif git_root=$(git rev-parse --show-toplevel 2>/dev/null); then
	repo=$git_root
	revision=$(git rev-parse HEAD 2>/dev/null || printf unknown)
	revision_kind=git
fi
if [[ ! "$revision" =~ ^[A-Za-z0-9._-]{1,128}$ ]]; then
	revision=unknown
	revision_kind=unknown
fi
timestamp=$(jq -nr 'now as $n | ($n | strftime("%Y-%m-%dT%H:%M:%S")) + ("." + ("00" + ((($n * 1000 | floor) % 1000) | tostring))[-3:] + "Z")') || {
	echo "error: cannot timestamp cccc log" >&2
	exit 2
}
record=$(jq -cn --arg id "${log_run##*/}" --arg ts "$timestamp" --arg phase "$phase" --arg case "$case_id" --arg repo "$repo" --arg rev "$revision" --arg kind "$revision_kind" --argjson exit "$overall_exit" --arg verdict "$verdict" --argjson cw "$COG_WARN" --argjson yw "$CYC_WARN" --argjson ch "$COG_HARD" --argjson yh "$CYC_HARD" --slurpfile files <(printf '%s\n' "$results") '{schemaVersion:1,runId:$id,timestamp:$ts,phase:$phase,repository:$repo,revision:$rev,revisionKind:$kind,exitCode:$exit,verdict:$verdict,thresholds:{cognitiveWarning:$cw,cyclomaticWarning:$yw,cognitiveHard:$ch,cyclomaticHard:$yh},files:$files[0]} + (if $case == "" then {} else {caseId:$case} end)') || {
	echo "error: cannot build cccc log record" >&2
	exit 2
}
tmp_record="$log_run/.result.jsonl.tmp"
if [[ -e "$log_run/result.jsonl" || -L "$log_run/result.jsonl" ]] || ! (
	umask 077
	printf '%s\n' "$record" >"$tmp_record"
) || ! chmod 600 "$tmp_record" || ! mv -- "$tmp_record" "$log_run/result.jsonl"; then
	echo "error: cannot persist cccc log record" >&2
	exit 2
fi
exit "$overall_exit"
