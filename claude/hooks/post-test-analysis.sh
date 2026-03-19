#!/bin/bash
# テスト失敗時にCodexでのレビューを提案

input=$(cat)
eval "$(echo "$input" | jq -r '@sh "exit_code=\(.exit_code // 0) output=\((.stdout // "") + (.stderr // "") | ascii_downcase)"')"

if echo "$output" | grep -qE 'test|jest|vitest|pytest|rspec|failed|error' && [ "$exit_code" != "0" ]; then
  echo '{"message":"[提案] テストが失敗しました。/codex でレビューを検討してください。"}'
else
  echo '{}'
fi
