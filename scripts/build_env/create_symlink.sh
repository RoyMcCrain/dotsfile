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
ln -sf ${BASE_DIR}/codex/fugu.config.toml ~/.codex/fugu.config.toml
ln -sf ${BASE_DIR}/codex/skills/context-loader ~/.codex/skills/context-loader

# Antigravity CLI (agy) — customization root: ~/.gemini/antigravity-cli
# 旧 Gemini CLI の後継。グローバル指示は AGENTS.md 規約、skills/ は自動検出。
mkdir -p ~/.gemini/antigravity-cli/skills
ln -sf ${BASE_DIR}/antigravity/AGENTS.md ~/.gemini/antigravity-cli/AGENTS.md
ln -sf ${BASE_DIR}/antigravity/instructions.md ~/.gemini/antigravity-cli/instructions.md
ln -sf ${BASE_DIR}/antigravity/skills/context-loader ~/.gemini/antigravity-cli/skills/context-loader
