#!/usr/bin/env bash
# Query xAI Grok with the x_search tool; save raw JSON and print a normalized summary.
set -euo pipefail

die() {
	printf '%s\n' "$1" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Usage: grok-x-search.sh --query TEXT --output PATH
EOF
}

resolve_role() {
	local role="$1"
	local resolver="${MODEL_RESOLVER:-${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/resolve-model.sh}"
	resolver="${resolver/#\~/$HOME}"
	[[ -x "$resolver" ]] || die "model resolver not found: $resolver"
	"$resolver" "$role"
}

get_bearer_token() {
	if [[ -n "${XAI_API_KEY:-}" ]]; then
		printf '%s' "$XAI_API_KEY"
		return 0
	fi

	local pi_bin="${PI_BIN:-pi}"
	local token
	if ! token=$("$pi_bin" auth print-bearer-token --provider xai 2>/dev/null); then
		die "failed to obtain xAI bearer token"
	fi
	[[ -n "$token" ]] || die "empty xAI bearer token"
	printf '%s' "$token"
}

parse_args() {
	query=''
	output=''
	while (($# > 0)); do
		case "$1" in
		--query)
			shift
			[[ $# -gt 0 ]] || {
				usage >&2
				exit 1
			}
			query=$1
			;;
		--output)
			shift
			[[ $# -gt 0 ]] || {
				usage >&2
				exit 1
			}
			output=$1
			;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			die "unknown argument: $1"
			;;
		esac
		shift
	done

	[[ -n "$query" ]] || die "missing required argument: --query"
	[[ -n "$output" ]] || die "missing required argument: --output"
}

fetch_response() {
	local token="$1"
	local payload="$2"
	local output_path="$3"
	local curl_bin="${CURL_BIN:-curl}"
	local url="${XAI_RESPONSES_URL:-https://api.x.ai/v1/responses}"
	local http_code

	mkdir -p "$(dirname "$output_path")"

	http_code=$(
		"$curl_bin" -sS -w '%{http_code}' -o "$output_path" --config - -d "$payload" <<EOF
header = "Authorization: Bearer ${token}"
header = "Content-Type: application/json"
url = "${url}"
request = POST
EOF
	) || die "curl transport failed"

	printf '%s' "$http_code"
}

validate_response() {
	local output_path="$1"
	local http_code="$2"

	if [[ ! "$http_code" =~ ^2[0-9]{2}$ ]]; then
		die "xAI responses API returned HTTP ${http_code}"
	fi

	if ! jq -e . "$output_path" >/dev/null 2>&1; then
		die "xAI responses API returned malformed JSON"
	fi

	if jq -e 'has("error") and .error != null' "$output_path" >/dev/null 2>&1; then
		die "xAI responses API returned an error"
	fi
}

print_normalized() {
	local output_path="$1"
	jq -r '
		. as $root
		| [$root.output[]?.content[]? | select(.type == "output_text") | .text]
		| join("\n") as $text
		| (
			[
				($root.output[]?.content[]?.annotations[]? | select(.type == "url_citation") | .url),
				($root.citations[]? // empty)
			]
			| map(select(. != null and . != ""))
			| unique
		) as $cites
		| if ($text | length) > 0 then $text else empty end,
		(if ($cites | length) > 0 then "Citations:" else empty end),
		$cites[]
	' "$output_path"
}

main() {
	parse_args "$@"

	local resolved api_model token payload http_code
	resolved=$(resolve_role research.xai) || exit 1
	[[ -n "$resolved" ]] || die "research.xai resolved to empty model id"
	[[ "$resolved" == xai/* ]] || die "research.xai must resolve to xai/* model, got: $resolved"
	api_model="${resolved#xai/}"

	token=$(get_bearer_token)
	payload=$(jq -n \
		--arg model "$api_model" \
		--arg query "$query" \
		'{
			model: $model,
			input: (
				"Search X for relevant first-party announcements and public discussion. "
				+ "Distinguish official posts from general reactions and cite the X posts used.\n\n"
				+ "Research question:\n"
				+ $query
			),
			tools: [{type: "x_search"}]
		}')

	http_code=$(fetch_response "$token" "$payload" "$output")
	validate_response "$output" "$http_code"
	print_normalized "$output"
}

main "$@"
