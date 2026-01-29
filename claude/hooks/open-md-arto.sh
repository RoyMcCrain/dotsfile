#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path' 2>/dev/null)
[[ "$FILE_PATH" != *.md ]] && exit 0
lsof -c arto 2>/dev/null | grep -q "$FILE_PATH" && exit 0
open -a Arto "$FILE_PATH"
exit 0
