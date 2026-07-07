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
  "gemrc"
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

ASDF_ITEMS=(
  "default-npm-packages"
  "asdfrc"
  )

# Create symbolic links
for ITEM in "${ASDF_ITEMS[@]}"
do
  DESTINATION=~/.${ITEM}

  ln -s ${BASE_DIR}/asdf/${ITEM} ${DESTINATION}
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
for OLD_SKILL in cursor fugu; do
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

# Codex skills: Claude 向け skill を Codex でも使えるよう symlink する。
# Codex も Claude も同じ SKILL.md 形式なので、claude/skills/* をそのまま共有できる。
# 既存の Codex 独自 skill（実ディレクトリ）は上書きしない。
for SKILL in ${BASE_DIR}/claude/skills/*; do
  NAME=$(basename "${SKILL}")
  # Claude の単体 .md skill は Codex の skill ディレクトリ形式に変換する
  if [ -f "${SKILL}" ] && [[ "${NAME}" == *.md ]]; then
    STEM=${NAME%.md}
    DEST=~/.codex/skills/${STEM}
    # Codex は SKILL.md 自体が symlink だと列挙しないため、Codex 側 adapter があれば
    # ディレクトリごと symlink し、なければ実ファイルとしてコピーする。
    if [ -f "${BASE_DIR}/codex/skills/${STEM}/SKILL.md" ]; then
      ln -sfn "${BASE_DIR}/codex/skills/${STEM}" "${DEST}"
    else
      mkdir -p "${DEST}"
      cp "${SKILL}" "${DEST}/SKILL.md"
    fi
    continue
  fi

  # 壊れた symlink は同名の ~/.agents/skills を fallback として探す
  SOURCE="${SKILL}"
  if [ ! -f "${SOURCE}/SKILL.md" ] && [ -f "$HOME/.agents/skills/${NAME}/SKILL.md" ]; then
    SOURCE="$HOME/.agents/skills/${NAME}"
  fi

  # SKILL.md を持つ skill だけ対象にする
  if [ ! -f "${SOURCE}/SKILL.md" ]; then
    continue
  fi

  # Codex 独自 skill（codex/skills/* 実体）が同名で存在する場合は
  # Codex 向けに調整済みなので claude 版で上書きしない。
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
  ln -sfn "${SOURCE}" "${DEST}"
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
ln -sfn ${BASE_DIR}/pi/agent/extensions ~/.pi/agent/extensions
if command -v npm >/dev/null 2>&1; then
  bash "${BASE_DIR}/scripts/build_env/patch_pi_min_output_tokens.sh"
else
  echo "skip Pi runtime patch (npm not found)"
fi

# Shared agent skills
# Keep selected skill sources tracked in this repository and expose them globally.
mkdir -p ~/.agents/skills ~/.agents/skill-backups
for OLD_SKILL in cursor fugu; do
  OLD_DEST="$HOME/.agents/skills/${OLD_SKILL}"
  if [ -L "${OLD_DEST}" ]; then
    rm "${OLD_DEST}"
  elif [ -e "${OLD_DEST}" ]; then
    mv "${OLD_DEST}" "$HOME/.agents/skill-backups/${OLD_SKILL}.backup-$(date +%Y%m%d%H%M%S)"
  fi
done
for SKILL in ${BASE_DIR}/.agents/skills/cmux*(N/) ${BASE_DIR}/.agents/skills/cheap-pr(N/) ${BASE_DIR}/.agents/skills/cursor-review(N/) ${BASE_DIR}/.agents/skills/fugu-review(N/) ${BASE_DIR}/.agents/skills/parallel-review(N/) ${BASE_DIR}/claude/skills/claude-review(N/) ${BASE_DIR}/claude/skills/cursor-impl(N/) ${BASE_DIR}/codex/skills/codex-review(N/); do
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
done
