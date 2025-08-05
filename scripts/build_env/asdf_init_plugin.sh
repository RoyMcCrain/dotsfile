#!/bin/zsh

plugins=(
  "nodejs"
  "deno"
  "rust"
  "rye"
  "uv"
)

for plugin in ${plugins[@]}; do
  asdf plugin add $plugin
done
