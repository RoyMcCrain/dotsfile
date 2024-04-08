#!/bin/zsh

plugins=(
	"nodejs"
	"deno"
	"fzf"
	"ruby"
	"golang"
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
