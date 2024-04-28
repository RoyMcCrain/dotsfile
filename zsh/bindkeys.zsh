function select-history() {
	BUFFER=$(history -n -r 1 | fzf --no-sort +m --query "$LBUFFER" --prompt="History > ")
	CURSOR=$#BUFFER
}
zle -N select-history
bindkey '^r' select-history


function ghq-fzf() {
	local preview_command
	if command -v eza >/dev/null 2>&1; then
		preview_command="eza -TF --level=1 --icons"
	else
		preview_command="ls -l"
	fi
	local src=$(ghq list | fzf --preview "$preview_command $(ghq root)/{}")
	if [ -n "$src" ]; then
		BUFFER="cd $(ghq root)/$src"
		zle accept-line
	fi
	zle -R -c
}
zle -N ghq-fzf
bindkey '^t' ghq-fzf

# vim風なキーバインド
bindkey -v

# Ctrl zでvimを再開
fancy-ctrl-z () {
	if [[ $#BUFFER -eq 0 ]]; then
		BUFFER="fg"
		zle accept-line -w
	else
		zle push-input -w
		zle clear-screen -w
	fi
}
zle -N fancy-ctrl-z
bindkey '^Z' fancy-ctrl-z

