#!/bin/zsh

plugins=(
  "nodejs"
  "bat"
  "deno"
  "fzf"
  "ruby"
  "ghq"
  "golang"
  "jq"
  "neovim"
  "github-cli" # gh
  "ripgrep"
  "rust"
  "rye"
  "lua-language-server"
)

for plugin in ${plugins[@]}; do
  asdf plugin add $plugin
done
