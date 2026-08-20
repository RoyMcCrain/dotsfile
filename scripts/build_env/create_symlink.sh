#!/bin/zsh

if ! command -v ghq >/dev/null 2>&1; then
  echo "ghq command not found. Please install ghq."
  exit 1
fi

# Define the base directory
BASE_DIR=$(ghq root)/github.com/RoyMcCrain/dotsfile

# Define the files/folders to link
LINK_ITEMS=(
  "zprofile"
  "nvim"
  "gitconfig"
)

# Create symbolic links
for ITEM in "${LINK_ITEMS[@]}"
do
  if [[ ${ITEM} == "nvim" ]]; then
    DESTINATION=~/.config/${ITEM}
  else
    DESTINATION=~/.${ITEM}
  fi

  ln -s ${BASE_DIR}/${ITEM} ${DESTINATION}
done

# Create ~/.local/bin if not exists
mkdir -p ~/.local/bin

# Create symlink for ai-commit
ln -s ${BASE_DIR}/scripts/ai-commit.sh ~/.local/bin/ai-commit

# Claude Code
mkdir -p ~/.claude
ln -sf ${BASE_DIR}/claude/commands ~/.claude/commands
ln -sf ${BASE_DIR}/claude/agents ~/.claude/agents
ln -sf ${BASE_DIR}/claude/hooks ~/.claude/hooks
ln -sf ${BASE_DIR}/claude/rules ~/.claude/rules
ln -sf ${BASE_DIR}/claude/skills ~/.claude/skills
ln -sf ${BASE_DIR}/claude/settings.json ~/.claude/settings.json

# Codex
mkdir -p ~/.codex/skills
for OLD_SKILL in cursor fugu crm-postmortem; do
  OLD_DEST="$HOME/.codex/skills/${OLD_SKILL}"
  if [ -L "${OLD_DEST}" ]; then
    rm "${OLD_DEST}"
  fi
done
ln -sf ${BASE_DIR}/codex/AGENTS.md ~/.codex/AGENTS.md
ln -sf ${BASE_DIR}/codex/instructions.md ~/.codex/instructions.md
ln -sf ${BASE_DIR}/codex/config.toml ~/.codex/config.toml
ln -sf ${BASE_DIR}/codex/fugu.json ~/.codex/fugu.json
# fugu profile は hook trust state などが追記されるためローカル実体で管理する。
# profile 本体は example から更新し、既存の hooks.state だけ引き継ぐ。
TMP_FUGU_HOOKS=$(mktemp)
if [ -f ~/.codex/fugu.config.toml ]; then
  awk 'BEGIN{keep=0} /^\[hooks\.state\]/{keep=1} keep{print}' ~/.codex/fugu.config.toml > "${TMP_FUGU_HOOKS}"
fi
cp ${BASE_DIR}/codex/fugu.config.toml.example ~/.codex/fugu.config.toml
if [ -s "${TMP_FUGU_HOOKS}" ]; then
  printf "\n" >> ~/.codex/fugu.config.toml
  cat "${TMP_FUGU_HOOKS}" >> ~/.codex/fugu.config.toml
fi
rm -f "${TMP_FUGU_HOOKS}"
ln -sf ${BASE_DIR}/codex/hooks.json ~/.codex/hooks.json
ln -sf ${BASE_DIR}/codex/hooks ~/.codex/hooks
# Codex 独自 skill（codex/skills/* の実ディレクトリ）を Codex で使えるよう symlink する。
for CODEX_SKILL in ${BASE_DIR}/codex/skills/*; do
  [ -f "${CODEX_SKILL}/SKILL.md" ] || continue
  ln -sfn "${CODEX_SKILL}" ~/.codex/skills/$(basename "${CODEX_SKILL}")
done

# Codex skills: shared skills from skills/ plus Codex-native overrides.
# Codex and other hosts use the same SKILL.md format; canonical shared skills live under skills/.
# Existing Codex-owned real directories are not overwritten.
for SKILL in ${BASE_DIR}/skills/*; do
  [ -d "${SKILL}" ] || continue
  NAME=$(basename "${SKILL}")

  # SKILL.md を持つ skill だけ対象にする
  if [ ! -f "${SKILL}/SKILL.md" ]; then
    continue
  fi

  # Codex 独自 skill（codex/skills/* 実体）が同名で存在する場合は
  # Codex 向けに調整済みなので shared 版で上書きしない。
  if [ -f "${BASE_DIR}/codex/skills/${NAME}/SKILL.md" ]; then
    echo "skip (codex-native skill): ${NAME}"
    continue
  fi

  DEST=~/.codex/skills/${NAME}
  # Codex 側に実ディレクトリ（非 symlink）が既にある場合は保護してスキップ
  if [ -e "${DEST}" ] && [ ! -L "${DEST}" ]; then
    echo "skip (codex-owned dir): ${NAME}"
    continue
  fi
  ln -sfn "${SKILL}" "${DEST}"
done

# Antigravity CLI (agy) — customization root: ~/.gemini/antigravity-cli
# 旧 Gemini CLI の後継。グローバル指示は AGENTS.md 規約、skills/ は自動検出。
mkdir -p ~/.gemini/antigravity-cli/skills
ln -sf ${BASE_DIR}/antigravity/AGENTS.md ~/.gemini/antigravity-cli/AGENTS.md
ln -sf ${BASE_DIR}/antigravity/instructions.md ~/.gemini/antigravity-cli/instructions.md
ln -sf ${BASE_DIR}/antigravity/skills/context-loader ~/.gemini/antigravity-cli/skills/context-loader

# Pi Coding Agent
# auth.json は秘密情報/OAuth を含むためリンクしない。
mkdir -p ~/.pi/agent
ln -sf ${BASE_DIR}/pi/agent/AGENTS.md ~/.pi/agent/AGENTS.md
ln -sf ${BASE_DIR}/pi/agent/settings.json ~/.pi/agent/settings.json
ln -sf ${BASE_DIR}/pi/agent/models.json ~/.pi/agent/models.json
ln -sf ${BASE_DIR}/pi/agent/model-roles.json ~/.pi/agent/model-roles.json
ln -sf ${BASE_DIR}/pi/agent/resolve-model.sh ~/.pi/agent/resolve-model.sh
ln -sfn ${BASE_DIR}/pi/agent/extensions ~/.pi/agent/extensions
ln -sfn ${BASE_DIR}/pi/agent/lib ~/.pi/agent/lib
if command -v npm >/dev/null 2>&1; then
  bash "${BASE_DIR}/scripts/build_env/patch_pi_min_output_tokens.sh"
else
  echo "skip Pi runtime patch (npm not found)"
fi

# Shared agent skills
# Keep shared skill sources tracked in this repository and expose them globally.
mkdir -p ~/.agents/skills ~/.agents/skill-backups
for OLD_SKILL in cursor fugu large-diff-review cursor-review crm-postmortem; do
  OLD_DEST="$HOME/.agents/skills/${OLD_SKILL}"
  if [ -L "${OLD_DEST}" ]; then
    rm "${OLD_DEST}"
  elif [ -e "${OLD_DEST}" ]; then
    mv "${OLD_DEST}" "$HOME/.agents/skill-backups/${OLD_SKILL}.backup-$(date +%Y%m%d%H%M%S)"
  fi
done
LIST_SKILLS="${BASE_DIR}/scripts/build_env/list_shared_agent_skills.sh"
SKILL_LIST_FILE=$(mktemp)
if ! bash "${LIST_SKILLS}" "${BASE_DIR}" >"${SKILL_LIST_FILE}"; then
  rm -f "${SKILL_LIST_FILE}"
  exit 1
fi
if [ ! -s "${SKILL_LIST_FILE}" ]; then
  echo "no shared agent skills found" >&2
  rm -f "${SKILL_LIST_FILE}"
  exit 1
fi
while IFS= read -r SKILL <&3; do
  [ -n "${SKILL}" ] || continue
  [ -f "${SKILL}/SKILL.md" ] || continue
  NAME=$(basename "${SKILL}")
  DEST="$HOME/.agents/skills/${NAME}"
  if [ -L "${DEST}" ]; then
    rm "${DEST}"
  elif [ -e "${DEST}" ]; then
    if diff -qr "${SKILL}" "${DEST}" >/dev/null 2>&1; then
      rm -rf "${DEST}"
    else
      mv "${DEST}" "$HOME/.agents/skill-backups/${NAME}.backup-$(date +%Y%m%d%H%M%S)"
    fi
  fi
  ln -sfn "${SKILL}" "${DEST}"
done 3<"${SKILL_LIST_FILE}"
rm -f "${SKILL_LIST_FILE}"

# hunk-review: stable Devbox profile path keeps the bundled skill in sync with Hunk updates
HUNK_SKILL_SRC="$HOME/.local/share/devbox/global/default/.devbox/nix/profile/default/share/hunk/skills/hunk-review"
HUNK_SKILL_DEST="$HOME/.agents/skills/hunk-review"
if [ -L "${HUNK_SKILL_DEST}" ]; then
  rm "${HUNK_SKILL_DEST}"
elif [ -e "${HUNK_SKILL_DEST}" ]; then
  mv "${HUNK_SKILL_DEST}" "$HOME/.agents/skill-backups/hunk-review.backup-$(date +%Y%m%d%H%M%S)"
fi
ln -sfn "${HUNK_SKILL_SRC}" "${HUNK_SKILL_DEST}"

# git hooks: run the test suite before every push (.githooks/pre-push)
git -C "${BASE_DIR}" config --local core.hooksPath .githooks
