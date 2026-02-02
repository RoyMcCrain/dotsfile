#!/bin/bash
# テスト失敗時にCodexでの分析を提案

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // ""')
exit_code=$(echo "$input" | jq -r '.exit_code // 0')
output=$(echo "$input" | jq -r '(.stdout // "") + (.stderr // "")' | tr '[:upper:]' '[:lower:]')

if [ "$tool_name" != "Bash" ]; then
  echo '{}'
  exit 0
fi

if echo "$output" | grep -qE 'test|jest|vitest|pytest|rspec|failed|error' && [ "$exit_code" != "0" ]; then
  echo '{"message":"[提案] テストが失敗しました。/codex-review で詳細分析を検討してください。"}'
else
  echo '{}'
fi
