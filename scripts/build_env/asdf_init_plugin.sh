#!/bin/zsh

plugins=(
  "nodejs"
  "deno"
  "rust"
  "rye"
)

for plugin in ${plugins[@]}; do
  asdf plugin add $plugin
done
