#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031,SC2089,SC2090,SC2123

setup_file() {
	REAL_CCCC="$(command -v cccc 2>/dev/null || true)"
	export REAL_CCCC
}

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/check-complexity"
	STUB_BIN="$TEST_ROOT/stub-bin"
	CCCC_LOG="$TEST_ROOT/cccc-args.log"
	mkdir -p "$STUB_BIN"
	SCRIPT="$BATS_TEST_DIRNAME/../scripts/check_complexity.sh"
	unset BATS_CCCC_EXIT BATS_CCCC_JSON
	export CCCC_LOG
	write_cccc_stub
	PATH="$STUB_BIN:$PATH"
	export PATH
}

write_cccc_stub() {
	cat >"$STUB_BIN/cccc" <<'EOF'
#!/usr/bin/env bash
: >"${CCCC_LOG:-/dev/null}"
target=""
while [[ $# -gt 0 ]]; do
	printf '%s\n' "$1" >>"${CCCC_LOG:-/dev/null}"
	case "$1" in
		--) shift; target=${1:-}; break ;;
	esac
	shift
done
if [[ "${BATS_CCCC_EXIT:-}" != "" ]]; then
	printf 'cccc: simulated failure\n' >&2
	exit "${BATS_CCCC_EXIT}"
fi
if [[ "$target" == *.fish ]]; then
	printf '%s\n' '{"files":[],"summary":{"file_count":0,"function_count":0,"parse_error_count":0,"parse_error_file_count":0}}'
	exit 0
fi
if [[ -f "${target}.report.json" ]]; then
	printf '%s\n' "$(<"${target}.report.json")"
	exit 0
fi
if [[ -n "${BATS_CCCC_JSON:-}" ]]; then
	printf '%s\n' "$BATS_CCCC_JSON"
	exit 0
fi
printf '%s\n' '{"files":[],"summary":{"file_count":0,"function_count":0,"parse_error_count":0,"parse_error_file_count":0}}'
EOF
	chmod +x "$STUB_BIN/cccc"
}

make_file() {
	local path=$1
	local body=${2:-}
	mkdir -p "$(dirname "$path")"
	printf '%s\n' "$body" >"$path"
}

json_report() {
	local path=$1
	local cog=$2
	local cyc=$3
	jq -n \
		--arg path "$path" \
		--argjson cog "$cog" \
		--argjson cyc "$cyc" \
		'{
			files: [{
				path: $path,
				cognitive: $cog,
				cyclomatic: $cyc,
				functions: [{
					name: "fn",
					kind: "function",
					line: 1,
					cognitive: $cog,
					cyclomatic: $cyc
				}]
			}],
			summary: {
				file_count: 1,
				function_count: 99,
				parse_error_count: 0,
				parse_error_file_count: 0
			}
		}'
}

store_cccc_json() {
	local path=$1
	local json=$2
	printf '%s\n' "$json" >"${path}.report.json"
}

json_report_functions() {
	local path=$1
	local functions_json=$2
	jq -n \
		--arg path "$path" \
		--argjson functions "$functions_json" \
		'{
			files: [{
				path: $path,
				cognitive: 0,
				cyclomatic: 0,
				functions: $functions
			}],
			summary: {
				file_count: 1,
				function_count: 99,
				parse_error_count: 0,
				parse_error_file_count: 0
			}
		}'
}

@test "check_complexity: boundary cognitive 10 and cyclomatic 8 emit no WARNING" {
	local f="$TEST_ROOT/boundary.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 10 8)"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 0 ]
	[[ "$output" == *"MEASURED"* ]]
	[[ "$output" != *"WARNING"* ]]
}

@test "check_complexity: cognitive 11 triggers WARNING and still exits 0" {
	local f="$TEST_ROOT/over-cog.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 11 8)"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 0 ]
	[[ "$output" == *"WARNING"* ]]
	[[ "$output" == *"cognitive"* ]]
	[[ "$output" == *"11"* ]]
	[[ "$output" == *"10"* ]]
}

@test "check_complexity: cyclomatic 9 triggers WARNING and still exits 0" {
	local f="$TEST_ROOT/over-cyc.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 10 9)"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 0 ]
	[[ "$output" == *"WARNING"* ]]
	[[ "$output" == *"cyclomatic"* ]]
	[[ "$output" == *"9"* ]]
	[[ "$output" == *"8"* ]]
}

@test "check_complexity: hard boundary cognitive 15 and cyclomatic 10 warn but exit 0" {
	local f="$TEST_ROOT/hard-boundary.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 15 10)"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 0 ]
	[[ "$output" == *"MEASURED"* ]]
	[[ "$output" == *"WARNING"* ]]
	[[ "$output" == *"cognitive=15"* ]]
	[[ "$output" != *"ERROR"* ]]
}

@test "check_complexity: cognitive 16 triggers ERROR and exit 1" {
	local f="$TEST_ROOT/hard-cog.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 16 8)"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 1 ]
	[[ "$output" == *"ERROR: ${f}:1 fn"* ]]
	[[ "$output" == *"cognitive=16"* ]]
	[[ "$output" == *"15"* ]]
	[[ "$output" == *"MEASURED"* ]]
}

@test "check_complexity: cyclomatic 11 triggers ERROR and exit 1" {
	local f="$TEST_ROOT/hard-cyc.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 10 11)"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 1 ]
	[[ "$output" == *"ERROR: ${f}:1 fn"* ]]
	[[ "$output" == *"cyclomatic=11"* ]]
	[[ "$output" == *"10"* ]]
}

@test "check_complexity: both metrics over hard limits emit combined ERROR" {
	local f="$TEST_ROOT/hard-both.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 16 11)"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 1 ]
	[[ "$output" == *"ERROR:"* ]]
	[[ "$output" == *"cognitive=16"* ]]
	[[ "$output" == *"cyclomatic=11"* ]]
}

@test "check_complexity: later function hard violation fails after earlier ok function" {
	local f="$TEST_ROOT/multi-fn.ts"
	make_file "$f" "export {}"
	local funcs='[
		{"name":"okFn","kind":"function","line":1,"cognitive":3,"cyclomatic":2},
		{"name":"badFn","kind":"function","line":40,"cognitive":16,"cyclomatic":4}
	]'
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report_functions "$f" "$funcs")"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 1 ]
	[[ "$output" == *"okFn"* ]]
	[[ "$output" == *"badFn"* ]]
	[[ "$output" == *"ERROR: ${f}:40 badFn"* ]]
}

@test "check_complexity: hard violation then passing file exits 1 and measures both" {
	local bad="$TEST_ROOT/order-hard.ts"
	local ok="$TEST_ROOT/order-ok.ts"
	make_file "$bad" "export {}"
	make_file "$ok" "export {}"
	store_cccc_json "$bad" "$(json_report "$bad" 16 8)"
	store_cccc_json "$ok" "$(json_report "$ok" 3 2)"
	unset BATS_CCCC_JSON BATS_CCCC_EXIT
	run bash "$SCRIPT" "$bad" "$ok"
	[ "$status" -eq 1 ]
	[[ "$output" == *"ERROR: ${bad}"* ]]
	[[ "$output" == *"MEASURED: ${ok}"* ]]
}

@test "check_complexity: passing file then hard violation exits 1 and measures both" {
	local ok="$TEST_ROOT/order-ok2.ts"
	local bad="$TEST_ROOT/order-hard2.ts"
	make_file "$ok" "export {}"
	make_file "$bad" "export {}"
	store_cccc_json "$ok" "$(json_report "$ok" 3 2)"
	store_cccc_json "$bad" "$(json_report "$bad" 16 8)"
	unset BATS_CCCC_JSON BATS_CCCC_EXIT
	run bash "$SCRIPT" "$ok" "$bad"
	[ "$status" -eq 1 ]
	[[ "$output" == *"MEASURED: ${ok}"* ]]
	[[ "$output" == *"ERROR: ${bad}"* ]]
}

@test "check_complexity: hard violation then unverified exits 2" {
	local bad="$TEST_ROOT/mix-hard.ts"
	local fish="$TEST_ROOT/mix.fish"
	make_file "$bad" "export {}"
	make_file "$fish" "echo"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$bad" 16 8)"
	unset BATS_CCCC_EXIT
	run bash "$SCRIPT" "$bad" "$fish"
	[ "$status" -eq 2 ]
	[[ "$output" == *"ERROR: ${bad}"* ]]
	[[ "$output" == *"UNVERIFIED: ${fish}"* ]]
}

@test "check_complexity: unverified then hard violation exits 2" {
	local fish="$TEST_ROOT/mix2.fish"
	local bad="$TEST_ROOT/mix-hard2.ts"
	make_file "$fish" "echo"
	make_file "$bad" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$bad" 16 8)"
	unset BATS_CCCC_EXIT
	run bash "$SCRIPT" "$fish" "$bad"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${fish}"* ]]
	[[ "$output" == *"ERROR: ${bad}"* ]]
}

@test "check_complexity: continues after hard error on remaining inputs" {
	local a="$TEST_ROOT/cont-a.ts"
	local b="$TEST_ROOT/cont-b.ts"
	local c="$TEST_ROOT/cont-c.ts"
	make_file "$a" "export {}"
	make_file "$b" "export {}"
	make_file "$c" "export {}"
	store_cccc_json "$a" "$(json_report "$a" 16 8)"
	store_cccc_json "$b" "$(json_report "$b" 3 2)"
	store_cccc_json "$c" "$(json_report "$c" 4 4)"
	unset BATS_CCCC_JSON BATS_CCCC_EXIT
	run bash "$SCRIPT" "$a" "$b" "$c"
	[ "$status" -eq 1 ]
	[[ "$output" == *"ERROR: ${a}"* ]]
	[[ "$output" == *"MEASURED: ${b}"* ]]
	[[ "$output" == *"MEASURED: ${c}"* ]]
}

@test "check_complexity: zero-function file is MEASURED" {
	local f="$TEST_ROOT/empty.ts"
	make_file "$f" ""
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(jq -n --arg path "$f" '{
		files: [{ path: $path, cognitive: 0, cyclomatic: 0, functions: [] }],
		summary: { file_count: 1, function_count: 99, parse_error_count: 0, parse_error_file_count: 0 }
	}')"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 0 ]
	[[ "$output" == *"MEASURED"* ]]
	[[ "$output" == *"0 functions"* ]]
}

@test "check_complexity: function count comes from functions arrays not summary" {
	local f="$TEST_ROOT/count.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 3 2)"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 0 ]
	[[ "$output" == *"(1 functions)"* ]]
	[[ "$output" != *"(99 functions)"* ]]
}

@test "check_complexity: parse errors are UNVERIFIED with exit 2" {
	local f="$TEST_ROOT/parse.ts"
	make_file "$f" "bad"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 1 1 | jq '.summary.parse_error_count = 1 | .summary.parse_error_file_count = 1')"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${f}: parse errors (count=1)"* ]]
}

@test "check_complexity: zero measured files are UNVERIFIED with exit 2" {
	local f="$TEST_ROOT/unsupported.fish"
	make_file "$f" "echo hi"
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${f}: zero measured files (unsupported language or unanalysed input)"* ]]
}

@test "check_complexity: mixed unsupported first then supported last exits 2 with both outcomes" {
	local bad="$TEST_ROOT/nope.fish"
	local ok="$TEST_ROOT/ok.ts"
	make_file "$bad" "echo"
	make_file "$ok" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$ok" 3 2)"
	unset BATS_CCCC_EXIT
	run bash "$SCRIPT" "$bad" "$ok"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${bad}: zero measured files"* ]]
	[[ "$output" == *"MEASURED: ${ok}"* ]]
}

@test "check_complexity: mixed supported and unsupported exits 2 but shows MEASURED" {
	local ok="$TEST_ROOT/ok2.ts"
	local bad="$TEST_ROOT/nope2.fish"
	make_file "$ok" "export {}"
	make_file "$bad" "echo"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$ok" 3 2)"
	unset BATS_CCCC_EXIT
	run bash "$SCRIPT" "$ok" "$bad"
	[ "$status" -eq 2 ]
	[[ "$output" == *"MEASURED: ${ok}"* ]]
	[[ "$output" == *"UNVERIFIED: ${bad}:"* ]]
}

@test "check_complexity: cccc CLI failure is UNVERIFIED" {
	local f="$TEST_ROOT/fail.ts"
	make_file "$f" "x"
	export BATS_CCCC_EXIT=1
	unset BATS_CCCC_JSON
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 2 ]
	[[ "$output" == *"cccc: simulated failure"* ]]
	[[ "$output" == *"UNVERIFIED: ${f}: cccc failed"* ]]
}

@test "check_complexity: malformed JSON is UNVERIFIED" {
	local f="$TEST_ROOT/malformed.ts"
	make_file "$f" "x"
	export BATS_CCCC_JSON='not-json'
	unset BATS_CCCC_EXIT
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${f}: invalid or unexpected JSON from cccc"* ]]
}

@test "check_complexity: JSON stream with leading scalar is UNVERIFIED and later input still measured" {
	local first="$TEST_ROOT/stream-first.ts"
	local second="$TEST_ROOT/stream-second.ts"
	make_file "$first" "export {}"
	make_file "$second" "export {}"
	local report
	report="$(json_report "$first" 3 2)"
	store_cccc_json "$first" $'true\n'"$report"
	store_cccc_json "$second" "$(json_report "$second" 3 2)"
	unset BATS_CCCC_JSON BATS_CCCC_EXIT
	run bash "$SCRIPT" "$first" "$second"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${first}: invalid or unexpected JSON from cccc"* ]]
	[[ "$output" != *"MEASURED: ${first}"* ]]
	[[ "$output" == *"MEASURED: ${second}"* ]]
}

@test "check_complexity: two JSON report objects in one response is UNVERIFIED not parse error" {
	local stream="$TEST_ROOT/double-report.ts"
	local ok="$TEST_ROOT/after-double.ts"
	make_file "$stream" "export {}"
	make_file "$ok" "export {}"
	local dual
	dual="$(json_report "$stream" 3 2)"$'\n'"$(json_report "$stream" 4 4)"
	store_cccc_json "$stream" "$dual"
	store_cccc_json "$ok" "$(json_report "$ok" 3 2)"
	unset BATS_CCCC_JSON BATS_CCCC_EXIT
	run bash "$SCRIPT" "$stream" "$ok"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${stream}: invalid or unexpected JSON from cccc"* ]]
	[[ "$output" != *"parse errors"* ]]
	[[ "$output" == *"MEASURED: ${ok}"* ]]
}

@test "check_complexity: contradictory empty files with file_count 1 is UNVERIFIED" {
	local f="$TEST_ROOT/contradict.ts"
	make_file "$f" "x"
	export BATS_CCCC_JSON='{"files":[],"summary":{"file_count":1,"function_count":0,"parse_error_count":0,"parse_error_file_count":0}}'
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${f}: invalid or unexpected JSON from cccc"* ]]
}

@test "check_complexity: fractional metrics are UNVERIFIED" {
	local f="$TEST_ROOT/fractional.ts"
	make_file "$f" "x"
	BATS_CCCC_JSON="$(json_report "$f" 1 1 | jq '.files[0].functions[0].cognitive = 1.5')"
	export BATS_CCCC_JSON
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${f}: invalid or unexpected JSON from cccc"* ]]
}

@test "check_complexity: missing numeric metrics are UNVERIFIED" {
	local f="$TEST_ROOT/missing.ts"
	make_file "$f" "x"
	export BATS_CCCC_JSON='{"files":[{"path":"x","functions":[{"name":"f","line":1}]}],"summary":{"file_count":1,"parse_error_count":0}}'
	run bash "$SCRIPT" "$f"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${f}: invalid or unexpected JSON from cccc"* ]]
}

@test "check_complexity: no arguments reports usage and exits 2" {
	run bash "$SCRIPT"
	[ "$status" -eq 2 ]
	[[ "$output" == *"usage"* ]]
}

@test "check_complexity: missing input file is UNVERIFIED" {
	run bash "$SCRIPT" "$TEST_ROOT/does-not-exist.ts"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${TEST_ROOT}/does-not-exist.ts: missing or not a regular file"* ]]
}

@test "check_complexity: directory input is UNVERIFIED" {
	local dir="$TEST_ROOT/a-dir"
	mkdir -p "$dir"
	run bash "$SCRIPT" "$dir"
	[ "$status" -eq 2 ]
	[[ "$output" == *"UNVERIFIED: ${dir}: missing or not a regular file"* ]]
}

@test "check_complexity: paths with spaces and -- separator" {
	local f="$TEST_ROOT/with spaces/sample.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 2 2)"
	run bash "$SCRIPT" -- "$f"
	[ "$status" -eq 0 ]
	[[ "$output" == *"with spaces"* ]]
	rg -F -- '--no-config' "$CCCC_LOG"
	rg -F -- '--no-cache' "$CCCC_LOG"
	rg -F -- '--no-ignore' "$CCCC_LOG"
}

@test "check_complexity: missing cccc in PATH is diagnosed" {
	local f="$TEST_ROOT/lonely.ts"
	make_file "$f" "x"
	local priv_bin="$TEST_ROOT/minimal-bin"
	mkdir -p "$priv_bin"
	ln -sf "$(command -v bash)" "$priv_bin/bash"
	ln -sf "$(command -v jq)" "$priv_bin/jq"
	run env PATH="$priv_bin" bash "$SCRIPT" "$f"
	[ "$status" -eq 2 ]
	[[ "$output" == *"cccc"* ]]
}

real_cccc_path() {
	local priv_bin="$TEST_ROOT/real-cccc-bin"
	mkdir -p "$priv_bin"
	ln -sf "$(command -v bash)" "$priv_bin/bash"
	ln -sf "$(command -v jq)" "$priv_bin/jq"
	ln -sf "$REAL_CCCC" "$priv_bin/cccc"
	printf '%s' "$priv_bin"
}

@test "integration: real cccc simple TypeScript passes" {
	[[ -n "${REAL_CCCC:-}" && -x "$REAL_CCCC" ]] || skip "real cccc not available"
	local f="$TEST_ROOT/integration/simple.ts"
	make_file "$f" $'export function add(a: number, b: number): number {\n  return a + b;\n}\n'
	local priv_bin
	priv_bin="$(real_cccc_path)"
	unset BATS_CCCC_JSON BATS_CCCC_EXIT
	run env PATH="$priv_bin" bash "$SCRIPT" "$f"
	[ "$status" -eq 0 ]
	[[ "$output" == *"MEASURED"* ]]
	[[ "$output" != *"ERROR"* ]]
}

@test "integration: real cccc reports warning-only fixture with exit 0" {
	[[ -n "${REAL_CCCC:-}" && -x "$REAL_CCCC" ]] || skip "real cccc not available"
	local f="$TEST_ROOT/integration/warn.ts"
	make_file "$f" "$(
		cat <<'TS'
export function warnOnly(x: number): string {
  if (x > 0) {
    if (x > 1) {
      if (x > 2) {
        if (x > 3) {
          if (x > 4) {
            return "deep";
          }
        }
      }
    }
  }
  return "ok";
}
TS
	)"
	local priv_bin
	priv_bin="$(real_cccc_path)"
	unset BATS_CCCC_JSON BATS_CCCC_EXIT
	run env PATH="$priv_bin" bash "$SCRIPT" "$f"
	[ "$status" -eq 0 ]
	[[ "$output" == *"MEASURED"* ]]
	[[ "$output" == *"WARNING"* ]]
	[[ "$output" != *"ERROR"* ]]
}

@test "legacy wrapper forwards measured success for path with spaces" {
	local legacy="$BATS_TEST_DIRNAME/../../cursor-impl/scripts/check_complexity.sh"
	local f="$TEST_ROOT/legacy spaces/ok.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 3 2)"
	run bash "$legacy" -- "$f"
	local legacy_status=$status
	local legacy_output=$output
	: >"$CCCC_LOG"
	run bash "$SCRIPT" -- "$f"
	[ "$legacy_status" -eq 0 ]
	[ "$status" -eq 0 ]
	[ "$legacy_output" = "$output" ]
	[[ "$output" == *"MEASURED"* ]]
	rg -F -- '--no-config' "$CCCC_LOG"
}

@test "legacy wrapper forwards hard violation exit 1 for path with spaces" {
	local legacy="$BATS_TEST_DIRNAME/../../cursor-impl/scripts/check_complexity.sh"
	local f="$TEST_ROOT/legacy spaces/hard.ts"
	make_file "$f" "export {}"
	export BATS_CCCC_JSON
	BATS_CCCC_JSON="$(json_report "$f" 16 8)"
	run bash "$legacy" -- "$f"
	local legacy_status=$status
	local legacy_output=$output
	: >"$CCCC_LOG"
	run bash "$SCRIPT" -- "$f"
	[ "$legacy_status" -eq 1 ]
	[ "$status" -eq 1 ]
	[ "$legacy_output" = "$output" ]
	[[ "$output" == *"ERROR:"* ]]
}

@test "legacy wrapper forwards unverified exit 2 for path with spaces" {
	local legacy="$BATS_TEST_DIRNAME/../../cursor-impl/scripts/check_complexity.sh"
	local f="$TEST_ROOT/legacy spaces/nope.fish"
	make_file "$f" "echo"
	run bash "$legacy" -- "$f"
	local legacy_status=$status
	local legacy_output=$output
	: >"$CCCC_LOG"
	run bash "$SCRIPT" -- "$f"
	[ "$legacy_status" -eq 2 ]
	[ "$status" -eq 2 ]
	[ "$legacy_output" = "$output" ]
	[[ "$output" == *"UNVERIFIED:"* ]]
}

@test "integration: real cccc hard violation fixture exits 1" {
	[[ -n "${REAL_CCCC:-}" && -x "$REAL_CCCC" ]] || skip "real cccc not available"
	local f="$TEST_ROOT/integration/hard.ts"
	make_file "$f" "$(
		cat <<'TS'
export const cyclomaticOver = (x: number) => {
  if (x === 0) return 0;
  if (x === 1) return 1;
  if (x === 2) return 2;
  if (x === 3) return 3;
  if (x === 4) return 4;
  if (x === 5) return 5;
  if (x === 6) return 6;
  if (x === 7) return 7;
  if (x === 8) return 8;
  if (x === 9) return 9;
  return -1;
};
TS
	)"
	local priv_bin
	priv_bin="$(real_cccc_path)"
	unset BATS_CCCC_JSON BATS_CCCC_EXIT
	run env PATH="$priv_bin" bash "$SCRIPT" "$f"
	[ "$status" -eq 1 ]
	[[ "$output" == *"ERROR:"* ]]
	[[ "$output" == *"MEASURED"* ]]
}
