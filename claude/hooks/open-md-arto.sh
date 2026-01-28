#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path' 2>/dev/null)
[[ "$FILE_PATH" == *.md ]] && open -a Arto "$FILE_PATH"
exit 0
