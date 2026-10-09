#!/usr/bin/env bash
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../impl/scripts/check_complexity.sh" "$@"
