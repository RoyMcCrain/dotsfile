#!/usr/bin/env bash
if [[ "${1:-}" == "--field" ]]; then
	shift
	echo "route/mock-review"
	exit 0
fi
echo "mock/auditor-model"
