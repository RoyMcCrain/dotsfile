#!/bin/zsh

plugins=(
  "ghq"
  "bat"
  "fzf"
  "jq"
  "neovim"
  "ripgrep"
  "lua-language-server"
  "direnv"
)

for plugin in ${plugins[@]}; do
  brew install $plugin
done
