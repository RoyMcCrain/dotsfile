#!/bin/bash
# 危険なコマンドをブロック

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // "Bash"')
command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')
block_msg='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"mainへのpushはClaude内では実行禁止です。手動で実行してください。"}}'

# jj git push: 引数なし or -b main を拒否
if printf '%s' "$command" | rg -q 'jj git push.*-b\s+main|jj git push\s*(;|&&|\||$)'; then
	echo "$block_msg"
	exit 0
fi

# git push: 引数なし or main指定を拒否
if printf '%s' "$command" | rg -q 'git push\s+\S+\s+main|git push\s*(;|&&|\||$)'; then
	echo "$block_msg"
	exit 0
fi

env_block_msg='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"秘密envファイルの読み取りは禁止です。値はBitwarden等で管理されています。"}}'
# A sample exemption applies only to the final path component. Env-like parents and
# private-key suffixes remain protected.
secret_env_path() {
	local path="$1" lower basename parents
	lower=$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')
	basename="${lower##*/}"
	parents=""
	if [[ "$lower" == */* ]]; then parents="${lower%/*}"; fi
	if [[ "$basename" == .env.example || "$basename" == .env.example.* ]]; then
		if [[ "$basename" == *.pem || "$basename" == *.key || "$basename" == *.p12 || "$basename" == *.pfx ]]; then
			return 0
		fi
		if printf '%s' "$parents" | rg -q '(^|/)(\.env[^/]*|\.envrc|credentials[^/]*|secrets[^/]*)(/|$)'; then return 0; fi
		return 1
	fi
	printf '%s' "$lower" | rg -q '(^|/)(\.env[^/]*|\.envrc|credentials[^/]*|secrets[^/]*)(/|$)|\.(pem|key|p12|pfx)(/|$)'
}

if [[ "$tool_name" == Read ]]; then
	if secret_env_path "$file_path"; then
		echo "$env_block_msg"
		exit 0
	fi
elif [[ "$tool_name" == Bash ]]; then
	readers='(^|[^A-Za-z0-9_./-])(cat|head|tail|less|more|grep|rg|sed|awk|jq|diff|od|xxd|strings|base64|bat|nl|tac)([^A-Za-z0-9_]|$)'
	if printf '%s' "$command" | rg -q "$readers"; then
		while IFS= read -r token; do
			if [[ "$token" == --*=* ]]; then token="${token#*=}"; fi
			if secret_env_path "$token"; then
				echo "$env_block_msg"
				exit 0
			fi
		done < <(printf '%s' "$command" | rg -o '[^[:space:]"\x27;&|<>]+' || true)
	fi
fi

# 出力なし = 許可
exit 0
