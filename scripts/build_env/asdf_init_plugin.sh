#!/bin/zsh

plugins=(
  "ghq"
  "nodejs"
  "bat"
  "deno"
  "fzf"
  "ruby"
  "jq"
  "neovim"
  "ripgrep"
  "rust"
  "rye"
  "lua-language-server"
)

for plugin in ${plugins[@]}; do
  asdf plugin add $plugin
done
