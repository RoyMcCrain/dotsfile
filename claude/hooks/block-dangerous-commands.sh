#!/bin/bash
# 危険なコマンドをブロック

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')
block_msg='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"mainへのpushはClaude内では実行禁止です。手動で実行してください。"}}'

# jj git push: 引数なし or -b main を拒否
if echo "$command" | grep -qE 'jj git push.*-b\s+main|jj git push\s*(;|&&|\||$)'; then
  echo "$block_msg"
  exit 0
fi

# git push: 引数なし or main指定を拒否
if echo "$command" | grep -qE 'git push\s+\S+\s+main|git push\s*(;|&&|\||$)'; then
  echo "$block_msg"
  exit 0
fi

# 秘密env（.env / *.local / .envrc.local）を読み取り系コマンドで開くのを拒否
env_block_msg='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"秘密envファイルの読み取りは禁止です。値はBitwarden等で管理されています。"}}'
secret_env_files='(\.env|\.env[A-Za-z0-9_.-]*\.local|\.envrc\.local)([^A-Za-z0-9_.-]|$)'
readers='(^|[^A-Za-z0-9_./-])(cat|head|tail|less|more|grep|rg|sed|awk|jq|diff|od|xxd|strings|base64|bat|nl|tac)([^A-Za-z0-9_]|$)'
if echo "$command" | grep -qE "$secret_env_files" && echo "$command" | grep -qE "$readers"; then
  echo "$env_block_msg"
  exit 0
fi

# 出力なし = 許可
exit 0
