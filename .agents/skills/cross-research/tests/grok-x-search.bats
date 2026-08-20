#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/grok-x-search"
	mkdir -p "$TEST_ROOT/out"
	SCRIPT="$BATS_TEST_DIRNAME/../scripts/grok-x-search.sh"
	ARGS_LOG="$TEST_ROOT/curl-args.json"
	STDIN_LOG="$TEST_ROOT/curl-stdin.txt"
	PAYLOAD_LOG="$TEST_ROOT/curl-payload.json"
	OUTPUT_PATH="$TEST_ROOT/out/response.json"

	FAKE_RESOLVER_DIR="$TEST_ROOT/agent"
	mkdir -p "$FAKE_RESOLVER_DIR"
	cat >"$FAKE_RESOLVER_DIR/model-roles.json" <<'EOF'
{
  "enabledModels": ["xai/test-research-model"],
  "roles": {
    "research.xai": {
      "pi": "xai/test-research-model",
      "label": "Test X Search model"
    }
  }
}
EOF
	cp "$BATS_TEST_DIRNAME/../../../../pi/agent/resolve-model.sh" "$FAKE_RESOLVER_DIR/resolve-model.sh"
	chmod +x "$FAKE_RESOLVER_DIR/resolve-model.sh"

	FAKE_PI="$TEST_ROOT/fake_pi.sh"
	cat >"$FAKE_PI" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail
printf '%s\n' "$@" | jq -R . | jq -s . >"$FAKE_PI_ARGS"
printf 'oauth-bearer-token\n'
EOF
	chmod +x "$FAKE_PI"

	FAKE_CURL="$TEST_ROOT/fake_curl.sh"
	cat >"$FAKE_CURL" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail

printf '%s\n' "$@" | jq -R . | jq -s . >"$FAKE_CURL_ARGS"

output=''
payload=''
use_config=0
while (($# > 0)); do
	case "$1" in
	-o)
		shift
		output=$1
		;;
	-d)
		shift
		payload=$1
		;;
	--config)
		shift
		[[ "$1" == "-" ]] && use_config=1
		;;
	esac
	shift || true
done

if [[ -n "$payload" ]]; then
	printf '%s' "$payload" >"$FAKE_CURL_PAYLOAD"
fi

if ((use_config)); then
	cat >"$FAKE_CURL_STDIN"
fi

status="${FAKE_CURL_HTTP_CODE:-200}"
body="${FAKE_CURL_BODY:-}"

if [[ -n "$output" ]]; then
	printf '%s' "$body" >"$output"
fi

if [[ "$status" == "000" ]]; then
	printf 'curl: (7) Failed to connect\n' >&2
	exit 7
fi

printf '%s' "$status"
exit "${FAKE_CURL_EXIT:-0}"
EOF
	chmod +x "$FAKE_CURL" "$SCRIPT"

	export MODEL_RESOLVER="$FAKE_RESOLVER_DIR/resolve-model.sh"
	export PI_BIN="$FAKE_PI"
	export CURL_BIN="$FAKE_CURL"
	export FAKE_PI_ARGS="$TEST_ROOT/pi-args.json"
	export FAKE_CURL_ARGS="$ARGS_LOG"
	export FAKE_CURL_STDIN="$STDIN_LOG"
	export FAKE_CURL_PAYLOAD="$PAYLOAD_LOG"
	export XAI_RESPONSES_URL="https://api.x.ai/v1/responses"
	unset XAI_API_KEY
}

run_grok() {
	local query="${1:-test query}"
	run "$SCRIPT" --query "$query" --output "$OUTPUT_PATH"
}

assert_token_not_in_argv() {
	local token="$1"
	if jq -e --arg token "$token" 'map(select(contains($token))) | length > 0' "$ARGS_LOG" >/dev/null 2>&1; then
		fail "bearer token leaked in curl argv"
	fi
}

@test "uses XAI_API_KEY and payload has stripped model plus x_search tool" {
	export XAI_API_KEY="super-secret-api-key"
	export FAKE_CURL_BODY='{"output":[{"content":[{"type":"output_text","text":"hello"}]}]}'

	run_grok "pricing update"
	[ "$status" -eq 0 ]

	jq -e '.model == "test-research-model"' "$PAYLOAD_LOG" >/dev/null
	jq -e '.tools == [{"type":"x_search"}]' "$PAYLOAD_LOG" >/dev/null
	jq -e '.input | contains("pricing update")' "$PAYLOAD_LOG" >/dev/null

	[ ! -e "$FAKE_PI_ARGS" ]
	assert_token_not_in_argv "super-secret-api-key"
	rg -Fq 'Authorization: Bearer super-secret-api-key' "$STDIN_LOG"
	[[ "$output" == *hello* ]]
}

@test "oauth fallback invokes pi auth print-bearer-token --provider xai" {
	export FAKE_CURL_BODY='{"output":[{"content":[{"type":"output_text","text":"from oauth"}]}]}'

	run_grok
	[ "$status" -eq 0 ]

	jq -e 'index("auth")' "$TEST_ROOT/pi-args.json" >/dev/null
	jq -e 'index("print-bearer-token")' "$TEST_ROOT/pi-args.json" >/dev/null
	jq -e 'index("--provider")' "$TEST_ROOT/pi-args.json" >/dev/null
	provider=$(jq -r '.[index("--provider") + 1]' "$TEST_ROOT/pi-args.json")
	[ "$provider" = "xai" ]
	assert_token_not_in_argv "oauth-bearer-token"
	rg -Fq 'Authorization: Bearer oauth-bearer-token' "$STDIN_LOG"
}

@test "token is absent from curl argv" {
	export XAI_API_KEY="argv-leak-test-token"
	export FAKE_CURL_BODY='{"output":[{"content":[{"type":"output_text","text":"ok"}]}]}'

	run_grok
	[ "$status" -eq 0 ]
	assert_token_not_in_argv "argv-leak-test-token"
	rg -Fq 'argv-leak-test-token' "$STDIN_LOG"
}

@test "normalizes output text and annotation citations" {
	export XAI_API_KEY="token"
	export FAKE_CURL_BODY='{
	  "output": [{
	    "content": [{
	      "type": "output_text",
	      "text": "Summary line",
	      "annotations": [
	        {"type": "url_citation", "url": "https://x.com/a/status/1"},
	        {"type": "url_citation", "url": "https://x.com/a/status/1"},
	        {"type": "other", "url": "https://ignored.example"}
	      ]
	    }]
	  }],
	  "citations": ["https://example.com/doc"]
	}'

	run_grok
	[ "$status" -eq 0 ]
	[[ "$output" == *Summary\ line* ]]
	[[ "$output" == *https://x.com/a/status/1* ]]
	[[ "$output" == *https://example.com/doc* ]]
	[ "$(printf '%s\n' "$output" | rg -c '^https://x.com/a/status/1$')" -eq 1 ]
}

@test "non-2xx returns nonzero without leaking token" {
	export XAI_API_KEY="fail-token-xyz"
	export FAKE_CURL_HTTP_CODE="502"
	export FAKE_CURL_BODY='upstream error'

	run_grok
	[ "$status" -ne 0 ]
	assert_token_not_in_argv "fail-token-xyz"
	[[ "$output" != *fail-token-xyz* ]]
	[[ "$output" == *502* || "$output" == *error* || "$output" == *HTTP* ]]
}

@test "api error returns nonzero without leaking token" {
	export XAI_API_KEY="api-error-token"
	export FAKE_CURL_BODY='{"error":{"message":"rate limited"}}'

	run_grok
	[ "$status" -ne 0 ]
	assert_token_not_in_argv "api-error-token"
	[[ "$output" != *api-error-token* ]]
	[[ "$output" == *error* ]]
}

@test "help exits zero" {
	run "$SCRIPT" --help

	[ "$status" -eq 0 ]
	[[ "$output" == *"Usage: grok-x-search.sh"* ]]
}

@test "transport failure returns nonzero without leaking token" {
	export XAI_API_KEY="transport-token"
	export FAKE_CURL_HTTP_CODE="000"

	run_grok

	[ "$status" -ne 0 ]
	[[ "$output" == *"transport failed"* ]]
	[[ "$output" != *transport-token* ]]
	assert_token_not_in_argv "transport-token"
}

@test "malformed JSON is preserved and returns nonzero" {
	export XAI_API_KEY="malformed-token"
	export FAKE_CURL_BODY='not-json'

	run_grok

	[ "$status" -ne 0 ]
	[[ "$output" == *"malformed JSON"* ]]
	[ "$(<"$OUTPUT_PATH")" = "not-json" ]
	[[ "$output" != *malformed-token* ]]
	assert_token_not_in_argv "malformed-token"
}
