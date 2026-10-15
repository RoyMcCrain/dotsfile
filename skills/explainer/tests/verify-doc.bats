#!/usr/bin/env bats

setup() {
	ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd -P)"
	VERIFY="$ROOT/skills/explainer/scripts/verify-doc.mjs"
	TMP="$(mktemp -d)"
	export HOME="$TMP/home"
	mkdir -p "$HOME"
}

teardown() {
	rm -rf "$TMP"
}

@test "checks success and rejects output mismatch" {
	mkdir -p "$TMP/success" "$TMP/mismatch"
	printf '{"checks":[{"name":"ok","cmd":"printf expected","expect":["expected"]}]}' >"$TMP/success/checks.json"
	printf '# Test\n' >"$TMP/success/README.md"
	run node "$VERIFY" "$TMP/success" --skip-html
	[ "$status" -eq 0 ]
	[[ "$output" == *"verdict: VERIFIED"* ]]

	printf '{"checks":[{"name":"bad","cmd":"printf actual","expect":["expected"]}]}' >"$TMP/mismatch/checks.json"
	printf '# Test\n' >"$TMP/mismatch/README.md"
	run node "$VERIFY" "$TMP/mismatch" --skip-html
	[ "$status" -eq 1 ]
	[[ "$output" == *"expected line not found"* ]]
}

@test "expected output followed by a failing status is rejected" {
	mkdir -p "$TMP/failure"
	printf '{"checks":[{"name":"bad-exit","cmd":"printf expected; exit 7","expect":["expected"]}]}' >"$TMP/failure/checks.json"
	printf '# Test\n' >"$TMP/failure/README.md"
	run node "$VERIFY" "$TMP/failure" --skip-html
	[ "$status" -eq 1 ]
	[[ "$output" == *"command exited 7"* ]]
}

@test "run wrapper preserves caller-relative paths containing spaces" {
	mkdir -p "$TMP/documents/a document"
	printf '{"checks":[{"name":"quoted","cmd":"printf works","expect":["works"]}]}' >"$TMP/documents/a document/checks.json"
	printf '# Test\n' >"$TMP/documents/a document/README.md"
	cd "$TMP/documents"
	run "$ROOT/skills/explainer/scripts/run.sh" verify "a document" --skip-html
	[ "$status" -eq 0 ]
	[[ "$output" == *"verdict: VERIFIED"* ]]
}

@test "build resolves marked from explicit runtime despite target package.json" {
	mkdir -p "$TMP/runtime/node_modules/marked" "$TMP/target"
	printf '{"type":"module","exports":"./index.js"}' >"$TMP/runtime/node_modules/marked/package.json"
	cat >"$TMP/runtime/node_modules/marked/index.js" <<'MODULE'
export const marked = { parse: (text) => `<p>${text}</p>` };
MODULE
	printf '{"private":true}' >"$TMP/target/package.json"
	printf '# Runtime test\n\nHello runtime.\n' >"$TMP/target/README.md"
	EXPLAINER_RUNTIME="$TMP/runtime" node "$ROOT/skills/explainer/scripts/build-html.mjs" "$TMP/target/README.md"
	[ -f "$TMP/target/dist/index.html" ]
	[[ "$(cat "$TMP/target/dist/index.html")" == *"Hello runtime."* ]]
}
