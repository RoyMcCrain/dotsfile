#!/bin/bash
# 大きな実装後にCodexレビューを提案

input=$(cat)
eval "$(echo "$input" | jq -r '@sh "file_path=\(.tool_input.file_path // "") new_string=\(.tool_input.new_string // "") content=\(.tool_input.content // "")"')"

# Claude自身の設定ファイルはスキップ
if echo "$file_path" | grep -qE '(/|^)\.?claude/'; then
  echo '{}'
  exit 0
fi

# 変更が大きい場合（100行以上）
line_count=0
if [ -n "$new_string" ]; then
  line_count=$(echo "$new_string" | wc -l | tr -d ' ')
elif [ -n "$content" ]; then
  line_count=$(echo "$content" | wc -l | tr -d ' ')
fi

if [ "$line_count" -gt 100 ]; then
  echo '{"message":"[提案] 大きな変更です。/codex でレビューを検討してください。"}'
else
  echo '{}'
fi
