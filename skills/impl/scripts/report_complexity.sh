#!/usr/bin/env bash
set -euo pipefail

usage() {
	echo "usage: report_complexity.sh [--log-dir DIR]" >&2
}

log_dir=${CCCC_LOG_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/impl/complexity}
if [[ $# -gt 0 ]]; then
	if [[ $# -ne 2 || $1 != --log-dir || -z $2 ]]; then
		usage
		exit 2
	fi
	log_dir=$2
fi
while [[ "$log_dir" != / && "$log_dir" == */ ]]; do log_dir=${log_dir%/}; done
if [[ -L "$log_dir" ]]; then
	echo "error: invalid cccc log root" >&2
	exit 2
fi
[[ "$log_dir" == /* ]] || log_dir=$PWD/$log_dir
if ! command -v fd >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
	echo "error: fd and jq are required in PATH" >&2
	exit 2
fi

invalid=0
file_list=
records_file=$(mktemp "${TMPDIR:-/tmp}/cccc-records.XXXXXXXX") || {
	echo "error: cannot create record aggregation scratch file" >&2
	exit 2
}
trap '[[ -z "$file_list" ]] || rm -f -- "$file_list"; rm -f -- "$records_file"' EXIT
if [[ -e "$log_dir" ]]; then
	if [[ ! -d "$log_dir" || -L "$log_dir" ]]; then
		echo "error: invalid cccc log root" >&2
		exit 2
	fi
	file_list=$(mktemp "${TMPDIR:-/tmp}/cccc-history.XXXXXXXX") || {
		echo "error: cannot create history discovery scratch file" >&2
		exit 2
	}
	trap 'rm -f -- "$file_list" "$records_file"' EXIT
	if ! fd --hidden --no-ignore --type f --max-depth 3 --glob result.jsonl --print0 -- "$log_dir" >"$file_list"; then
		echo "error: cannot discover cccc history" >&2
		exit 2
	fi
	while IFS= read -r -d '' file; do
		if jq -se '
			def integer: type == "number" and . == floor and . >= 0;
			def positive_integer: integer and . > 0;
			def valid_function:
				type == "object"
				and keys == ["cognitive", "cyclomatic", "line", "name"]
				and (.name | type == "string")
				and (.line | positive_integer)
				and (.cognitive | integer)
				and (.cyclomatic | integer);
			def valid_thresholds:
				type == "object"
				and keys == ["cognitiveHard", "cognitiveWarning", "cyclomaticHard", "cyclomaticWarning"]
				and (.cognitiveWarning | positive_integer)
				and (.cyclomaticWarning | positive_integer)
				and (.cognitiveHard | positive_integer)
				and (.cyclomaticHard | positive_integer)
				and .cognitiveWarning < .cognitiveHard
				and .cyclomaticWarning < .cyclomaticHard;
			def valid_file($thresholds):
				type == "object"
				and ((keys - ["functions", "path", "reason", "verdict"]) | length == 0)
				and (.path | type == "string" and length > 0)
				and (.functions | type == "array" and all(.[]; valid_function))
				and (.verdict | IN("pass", "warning", "error", "unverified"))
				and (if .verdict == "unverified" then
					(.reason | IN("missing_input", "cccc_missing", "cccc_failed", "invalid_report", "unmeasured_input", "parse_errors", "render_failed", "limit_evaluation_failed"))
					and (.functions | length == 0)
				else
					(has("reason") | not)
					and (([.functions[] | select(.cognitive > $thresholds.cognitiveHard or .cyclomatic > $thresholds.cyclomaticHard)] | length) > 0) == (.verdict == "error")
					and (([.functions[] | select(.cognitive > $thresholds.cognitiveWarning or .cyclomatic > $thresholds.cyclomaticWarning)] | length) > 0) == (.verdict == "warning" or .verdict == "error")
				end);
			def valid_record:
				type == "object"
				and ((keys - ["caseId", "exitCode", "files", "phase", "repository", "revision", "revisionKind", "runId", "schemaVersion", "thresholds", "timestamp", "verdict"]) | length == 0)
				and .schemaVersion == 1
				and (.runId | type == "string" and length > 0)
				and (.timestamp | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$"))
				and (.phase | IN("before", "after", "check"))
				and (if has("caseId") then (.caseId | type == "string" and test("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")) else true end)
				and (.repository | type == "string" and length > 0)
				and (.revisionKind | IN("jj", "git", "unknown"))
				and (.revision | type == "string" and length > 0)
				and (.thresholds | valid_thresholds)
				and (.thresholds as $thresholds | (.files | type == "array" and length > 0 and all(.[]; valid_file($thresholds))))
				and (.exitCode | IN(0, 1, 2))
				and (.verdict | IN("pass", "warning", "error", "unverified"))
				and ((any(.files[]; .verdict == "unverified")) == (.exitCode == 2))
				and ((any(.files[]; .verdict == "error") and .exitCode != 2) == (.exitCode == 1))
				and ((if .exitCode == 2 then "unverified" elif .exitCode == 1 then "error" elif any(.files[]; .verdict == "warning") then "warning" else "pass" end) == .verdict);
			length == 1 and (.[0] | valid_record)
		' "$file" >/dev/null 2>&1; then
			cat -- "$file" >>"$records_file"
			printf '\n' >>"$records_file"
		else
			invalid=$((invalid + 1))
			echo "warning: skipped invalid cccc record: $file" >&2
		fi
	done <"$file_list"
fi

jq -n --slurpfile records "$records_file" --argjson invalid "$invalid" '
 def verdict_counts($rs):
  {pass:([$rs[] | select(.verdict == "pass")] | length),
   warning:([$rs[] | select(.verdict == "warning")] | length),
   error:([$rs[] | select(.verdict == "error")] | length),
   unverified:([$rs[] | select(.verdict == "unverified")] | length)};
 def phase_counts($rs):
  {before:([$rs[] | select(.phase == "before")] | length),
   after:([$rs[] | select(.phase == "after")] | length),
   check:([$rs[] | select(.phase == "check")] | length)};
 def functions($record):
  [$record.files[] | select(.verdict != "unverified") | .functions[]];
 def maxima($functions):
  {cognitive:([$functions[].cognitive] | max // null),
   cyclomatic:([$functions[].cyclomatic] | max // null)};
 def over_count($functions; $cognitive; $cyclomatic):
  [$functions[] | select(.cognitive > $cognitive or .cyclomatic > $cyclomatic)] | length;
 def latest($rows; $phase):
  [$rows[] | select(.phase == $phase)] | sort_by(.timestamp, .runId) | last;
 def comparisons($rs):
  [$rs[] | select(has("caseId") and (.phase == "before" or .phase == "after")) as $record
   | $record.files[] | {caseId:$record.caseId, repository:$record.repository, path:.path,
      timestamp:$record.timestamp, runId:$record.runId, phase:$record.phase,
      verdict:.verdict, functions:.functions, thresholds:$record.thresholds}]
  | group_by([.caseId, .repository, .path])
  | map(.[0] as $key
    | latest(.; "before") as $before
    | latest(.; "after") as $after
    | select($before != null and $after != null)
    | select($before.verdict != "unverified" and $after.verdict != "unverified")
    | select($before.timestamp < $after.timestamp)
    | select([.[] | select(.phase == "before" and .timestamp == $before.timestamp)] | length == 1)
    | select([.[] | select(.phase == "after" and .timestamp == $after.timestamp)] | length == 1)
    | select($before.thresholds == $after.thresholds)
    | maxima($before.functions) as $before_max
    | maxima($after.functions) as $after_max
    | {caseId:$key.caseId, repository:$key.repository, path:$key.path,
       before:$before_max, after:$after_max,
       cognitiveMaximumChange:(if $after_max.cognitive == null or $before_max.cognitive == null then null else $after_max.cognitive - $before_max.cognitive end),
       cyclomaticMaximumChange:(if $after_max.cyclomatic == null or $before_max.cyclomatic == null then null else $after_max.cyclomatic - $before_max.cyclomatic end),
       warningFunctionChange:(over_count($after.functions; $after.thresholds.cognitiveWarning; $after.thresholds.cyclomaticWarning) - over_count($before.functions; $before.thresholds.cognitiveWarning; $before.thresholds.cyclomaticWarning)),
       hardFunctionChange:(over_count($after.functions; $after.thresholds.cognitiveHard; $after.thresholds.cyclomaticHard) - over_count($before.functions; $before.thresholds.cognitiveHard; $before.thresholds.cyclomaticHard))});

 ($records) as $all_records
 | {invalidRecords:$invalid,
  summary:{checks:($all_records | length), verdicts:verdict_counts($all_records), phases:phase_counts($all_records),
   measuredFiles:([$all_records[].files[] | select(.verdict != "unverified")] | length),
   unverifiedFiles:([$all_records[].files[] | select(.verdict == "unverified")] | length),
   warningFunctions:([$all_records[] as $record | functions($record)[] | select(.cognitive > $record.thresholds.cognitiveWarning or .cyclomatic > $record.thresholds.cyclomaticWarning)] | length),
   hardFunctions:([$all_records[] as $record | functions($record)[] | select(.cognitive > $record.thresholds.cognitiveHard or .cyclomatic > $record.thresholds.cyclomaticHard)] | length),
   maxima:maxima([$all_records[] | functions(.)[]])},
  comparisons:comparisons($all_records),
  note:"Complexity signals only; not proof of prevented bugs, code quality, or model superiority."}'
