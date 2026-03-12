#!/bin/bash
# 危険なコマンドをブロック

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# jj git push: 引数なし or -b main を拒否
if echo "$command" | grep -qE 'jj git push.*-b\s+main|jj git push\s*(;|&&|\||$)'; then
  echo '{"decision":"block","reason":"mainへのpushはClaude内では実行禁止です。手動で実行してください。"}'
  exit 0
fi

# git push: 引数なし or main指定を拒否
if echo "$command" | grep -qE 'git push\s+\S+\s+main|git push\s*(;|&&|\||$)'; then
  echo '{"decision":"block","reason":"mainへのpushはClaude内では実行禁止です。手動で実行してください。"}'
  exit 0
fi

echo '{"decision":"allow"}'
