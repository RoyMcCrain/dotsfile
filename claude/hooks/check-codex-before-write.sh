#!/bin/bash
# ファイル編集前に複雑な変更ならCodex相談を提案

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // ""')
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""')

if [ "$tool_name" != "Write" ] && [ "$tool_name" != "Edit" ]; then
  echo '{"decision":"allow"}'
  exit 0
fi

# 設定ファイルや重要ファイルの場合は提案
if echo "$file_path" | grep -qE '\.(config|json|yaml|yml|toml)$|config\.|settings'; then
  echo '{"decision":"allow","message":"[提案] 設定ファイルの変更です。複雑な場合は /codex-design で事前相談を検討してください。"}'
else
  echo '{"decision":"allow"}'
fi
