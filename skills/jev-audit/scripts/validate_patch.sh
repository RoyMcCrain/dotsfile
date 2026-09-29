#!/usr/bin/env bash
# Local patch validation for jev-audit approve/run (review_common only; no model calls).
set -euo pipefail
if ((BASH_VERSINFO[0] < 5)); then
	printf '%s\n' 'validate_patch.sh requires Bash 5+' >&2
	exit 1
fi
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/../../parallel-review/scripts/review_common.sh"
if [[ $# -ne 1 ]]; then
	review_common_die "usage: validate_patch.sh PATCH_FILE"
fi
review_validate_input "$1"
