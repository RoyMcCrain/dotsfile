#!/bin/bash
# Block dangerous Codex-generated shell commands.

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // .tool.input.command // .command // ""' 2>/dev/null)

block() {
  local reason="$1"
  jq -nc --arg reason "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
}

# jj git push: no explicit bookmark, or main bookmark.
if echo "$command" | grep -qE 'jj git push.*(--bookmark|-b)\s+main|jj git push\s*(;|&&|\||$)'; then
  block 'mainへのpushはCodex内では実行禁止です。手動で実行してください。'
  exit 0
fi

# git push: no explicit ref, or main ref.
if echo "$command" | grep -qE 'git push\s+\S+\s+main|git push\s*(;|&&|\||$)'; then
  block 'mainへのpushはCodex内では実行禁止です。手動で実行してください。'
  exit 0
fi

# Secret env reads (.env / *.local / .envrc.local).
secret_env_files='(\.env|\.env[A-Za-z0-9_.-]*\.local|\.envrc\.local)([^A-Za-z0-9_.-]|$)'
readers='(^|[^A-Za-z0-9_./-])(cat|head|tail|less|more|grep|rg|sed|awk|jq|diff|od|xxd|strings|base64|bat|nl|tac)([^A-Za-z0-9_]|$)'
if echo "$command" | grep -qE "$secret_env_files" && echo "$command" | grep -qE "$readers"; then
  block '秘密envファイルの読み取りは禁止です。値はBitwarden等で管理されています。'
  exit 0
fi

exit 0
