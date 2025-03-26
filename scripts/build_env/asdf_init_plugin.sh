#!/bin/zsh

plugins=(
  "nodejs"
  "deno"
  "ruby"
  "rust"
  "rye"
)

for plugin in ${plugins[@]}; do
  asdf plugin add $plugin
done
