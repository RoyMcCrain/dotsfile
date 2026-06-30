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
ln -sf ${BASE_DIR}/codex/AGENTS.md ~/.codex/AGENTS.md
ln -sf ${BASE_DIR}/codex/instructions.md ~/.codex/instructions.md
ln -sf ${BASE_DIR}/codex/config.toml ~/.codex/config.toml
ln -sf ${BASE_DIR}/codex/fugu.json ~/.codex/fugu.json
# fugu profile は hook trust state などが追記されるためローカル実体で管理する。
# 共有設定は ~/.codex/config.toml に集約し、profile は state だけ保持する。
TMP_FUGU_CONFIG=$(mktemp)
if [ -f ~/.codex/fugu.config.toml ]; then
  awk 'BEGIN{keep=0} /^\[hooks\.state\]/{keep=1} keep{print}' ~/.codex/fugu.config.toml > "${TMP_FUGU_CONFIG}"
fi
if [ ! -s "${TMP_FUGU_CONFIG}" ]; then
  cp ${BASE_DIR}/codex/fugu.config.toml.example ~/.codex/fugu.config.toml
else
  rm -f ~/.codex/fugu.config.toml
  cp "${TMP_FUGU_CONFIG}" ~/.codex/fugu.config.toml
fi
rm -f "${TMP_FUGU_CONFIG}"
ln -sf ${BASE_DIR}/codex/hooks.json ~/.codex/hooks.json
ln -sf ${BASE_DIR}/codex/hooks ~/.codex/hooks
ln -sf ${BASE_DIR}/codex/skills/context-loader ~/.codex/skills/context-loader

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
