#!/bin/bash
# Task完了後に計画レビューを提案

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // ""')

if [ "$tool_name" != "Task" ]; then
  echo '{}'
  exit 0
fi

echo '{"message":"[提案] 計画が作成されました。/codex-review で設計レビューを検討してください。"}'
