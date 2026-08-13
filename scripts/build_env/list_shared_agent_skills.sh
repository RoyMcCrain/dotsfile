#!/usr/bin/env bash
# Print absolute paths to skill directories linked into ~/.agents/skills for Pi.
# Single source of truth — also referenced from pi/README.md.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 BASE_DIR" >&2
  exit 1
fi

BASE_DIR=$1

emit() {
  local path=$1
  if [[ -f "${path}/SKILL.md" ]]; then
    printf '%s\n' "${path}"
  fi
}

# .agents/skills — Pi-canonical (cmux*, review pipeline, jj-workspace, cheap-pr)
shopt -s nullglob
for skill in "${BASE_DIR}"/.agents/skills/cmux*/; do
  emit "${skill}"
done
shopt -u nullglob
for name in cheap-pr cursor-review fugu-review implementation-report review-report review-verify parallel-review jj-workspace; do
  emit "${BASE_DIR}/.agents/skills/${name}"
done

# claude/skills — agent-specific or shared utilities Pi should see
for name in claude-review cursor-impl firecrawl-cli firecrawl-agent cross-research antigravity-research; do
  emit "${BASE_DIR}/claude/skills/${name}"
done

# codex/skills — Codex-native overrides Pi also loads
for name in codex-review mcp-delegate; do
  emit "${BASE_DIR}/codex/skills/${name}"
done
