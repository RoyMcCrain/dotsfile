#!/usr/bin/env bash
set -euo pipefail

COG_WARN=10
CYC_WARN=8
COG_HARD=15
CYC_HARD=10

usage() {
	echo "usage: check_complexity.sh [--] FILE..." >&2
	echo "Measure cognitive/cyclomatic complexity via cccc (warn: cognitive>${COG_WARN}, cyclomatic>${CYC_WARN}; hard fail: cognitive>${COG_HARD}, cyclomatic>${CYC_HARD})." >&2
}

if ! command -v jq >/dev/null 2>&1; then
	echo "error: jq is required in PATH" >&2
	exit 2
fi

if ! command -v cccc >/dev/null 2>&1; then
	echo "error: cccc is required in PATH (install: devbox global run setup-cccc)" >&2
	exit 2
fi

if [[ $# -eq 0 ]]; then
	usage
	exit 2
fi
if [[ ${1:-} == "--" ]]; then
	shift
fi
if [[ $# -eq 0 ]]; then
	usage
	exit 2
fi

overall_exit=0

mark_unverified() {
	local path=$1
	local reason=$2
	printf 'UNVERIFIED: %s: %s\n' "$path" "$reason" >&2
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

for input in "$@"; do
	if [[ ! -f "$input" ]]; then
		mark_unverified "$input" "missing or not a regular file"
		continue
	fi

	# Apply limits to validated JSON to keep tool failures distinct from violations.
	if ! json=$(cccc --no-config --no-cache --no-ignore -- "$input"); then
		mark_unverified "$input" "cccc failed"
		continue
	fi

	if ! jq -se "length == 1 and (.[0] | $json_valid_filter)" <<<"$json" >/dev/null 2>&1; then
		mark_unverified "$input" "invalid or unexpected JSON from cccc"
		continue
	fi

	file_count=$(jq -r '.summary.file_count' <<<"$json")
	parse_errors=$(jq -r '.summary.parse_error_count' <<<"$json")

	if [[ "$file_count" == "0" ]]; then
		mark_unverified "$input" "zero measured files (unsupported language or unanalysed input)"
		continue
	fi

	if [[ "$parse_errors" != "0" ]]; then
		mark_unverified "$input" "parse errors (count=${parse_errors})"
		continue
	fi

	if ! jq -r \
		--arg path "$input" \
		--argjson cog_warn "$COG_WARN" \
		--argjson cyc_warn "$CYC_WARN" \
		--argjson cog_hard "$COG_HARD" \
		--argjson cyc_hard "$CYC_HARD" \
		"$render_filter" <<<"$json"; then
		mark_unverified "$input" "failed to render complexity metrics"
		continue
	fi

	if ! hard_count=$(jq -r \
		--argjson cog_hard "$COG_HARD" \
		--argjson cyc_hard "$CYC_HARD" \
		'[.files[].functions[] | select(.cognitive > $cog_hard or .cyclomatic > $cyc_hard)] | length' \
		<<<"$json"); then
		mark_unverified "$input" "failed to evaluate hard complexity limits"
		continue
	fi
	if [[ "$hard_count" -gt 0 ]]; then
		mark_hard_violation
	fi
done

exit "$overall_exit"
