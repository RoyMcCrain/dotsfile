#!/usr/bin/env bash
# Print absolute paths to skill directories linked into ~/.agents/skills for Pi.
# Canonical shared skills live under .agents/skills/; Codex-native overrides under codex/skills/.
# Single source of truth — also referenced from pi/README.md.
set -euo pipefail

if [[ $# -ne 1 ]]; then
	echo "usage: $0 BASE_DIR" >&2
	exit 1
fi

BASE_DIR=$1
AGENTS_SKILLS_DIR="${BASE_DIR}/.agents/skills"

emit_required() {
	local path=${1%/}
	if [[ ! -f "${path}/SKILL.md" ]]; then
		echo "missing SKILL.md: ${path}" >&2
		return 1
	fi
	printf '%s\n' "${path}"
}

skill_count=0
shopt -s nullglob
for skill in "${AGENTS_SKILLS_DIR}"/*/; do
	emit_required "${skill}"
	skill_count=$((skill_count + 1))
done
shopt -u nullglob

if ((skill_count == 0)); then
	echo "missing shared skills under ${AGENTS_SKILLS_DIR}" >&2
	exit 1
fi

# codex/skills — Codex-native overrides Pi also loads
for name in codex-review mcp-delegate; do
	emit_required "${BASE_DIR}/codex/skills/${name}"
done
