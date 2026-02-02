#!/bin/bash
# 大きな実装後にCodexレビューを提案

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // ""')
new_string=$(echo "$input" | jq -r '.tool_input.new_string // ""')
content=$(echo "$input" | jq -r '.tool_input.content // ""')

if [ "$tool_name" != "Write" ] && [ "$tool_name" != "Edit" ]; then
  echo '{}'
  exit 0
fi

# 変更が大きい場合（50行以上）
line_count=0
if [ -n "$new_string" ]; then
  line_count=$(echo "$new_string" | wc -l | tr -d ' ')
elif [ -n "$content" ]; then
  line_count=$(echo "$content" | wc -l | tr -d ' ')
fi

if [ "$line_count" -gt 50 ]; then
  echo '{"message":"[提案] 大きな変更です。/codex-review でレビューを検討してください。"}'
else
  echo '{}'
fi
