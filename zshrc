########################################
# 環境変数
export LANG=ja_JP.UTF-8
export GIT_EDITOR=nvim
export EDITOR=nvim
export TERM=xterm-256color
# bun
export PATH=$PATH:$HOME/.bun/bin
bindkey -v
# asdf
. $HOME/.asdf/asdf.sh
# JAVA_HOME
. $HOME/.asdf/plugins/java/set-java-home.zsh
export ASDF_GOLANG_MOD_VERSION_ENABLED=false
# pipの設定
export PATH=$PATH:$HOME/.local/bin

# 色を使用出来るようにする
autoload -Uz colors && colors
# ヒストリの設定
HISTFILE=$HOME/.zsh_history
HISTSIZE=1000000
SAVEHIST=1000000

# プロンプト
# 1行表示
# PROMPT="%~ %# "
# 2行表示
PROMPT="%F{163}λ%f "

# 単語の区切り文字を指定する
autoload -Uz select-word-style
select-word-style default
# ここで指定した文字は単語区切りとみなされる
# / も区切りと扱うので、^W でディレクトリ１つ分を削除できる
zstyle ':zle:*' word-chars " /=;@:{},|"
zstyle ':zle:*' word-style unspecified

########################################
# 補完
# 補完機能を有効にする
autoload -Uz compinit && compinit

# 補完で小文字でも大文字にマッチさせる
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'
# ../ の後は今いるディレクトリを補完しない
zstyle ':completion:*' ignore-parents parent pwd ..
# sudo の後ろでコマンド名を補完する
zstyle ':completion:*:sudo:*' command-path /usr/local/sbin /usr/local/bin \
									 /usr/sbin /usr/bin /sbin /bin /usr/X11R6/bin
# ps コマンドのプロセス名補完
zstyle ':completion:*:processes' command 'ps x -o pid,s,args'


########################################
# vcs_info
autoload -Uz vcs_info
autoload -Uz add-zsh-hook

zstyle ':vcs_info:*' formats '%F{green}(%s)-[%b]%f'
zstyle ':vcs_info:*' actionformats '%F{red}(%s)-[%b|%a]%f'

function _update_vcs_info_msg() {
		LANG=en_US.UTF-8 vcs_info
		RPROMPT="${vcs_info_msg_0_}"
}
add-zsh-hook precmd _update_vcs_info_msg

########################################
# オプション
# 日本語ファイル名を表示可能にする
setopt print_eight_bit
# beep を無効にする
setopt no_beep
# フローコントロールを無効にする
setopt no_flow_control
# Ctrl+Dでzshを終了しない
setopt ignore_eof
# cd したら自動的にpushdする
setopt auto_pushd
# 重複したディレクトリを追加しない
setopt pushd_ignore_dups
# 同時に起動したzshの間でヒストリを共有する
setopt share_history
# 同じコマンドをヒストリに残さない
setopt hist_ignore_all_dups
# スペースから始まるコマンド行はヒストリに残さない
setopt hist_ignore_space
# ヒストリに保存するときに余分なスペースを削除する
setopt hist_reduce_blanks
# 高機能なワイルドカード展開を使用する
setopt extended_glob
########################################
# キーバインド

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

########################################
# エイリアス
alias js='jobs'
# fg %1 でそのjobsの復帰

alias la='ls -a'
alias ll='ls -lh'
alias lla='ls -lha'

alias rm='rm -ri'
alias rmf='rm -rf'
alias cp='cp -i'
alias mv='mv -i'

alias mkdir='mkdir -p'

alias a="nvim"
alias code="code -n ."
alias g="git"

# sudo の後のコマンドでエイリアスを有効にする
alias sudo='sudo '
# グローバルエイリアス
alias -g L='| less'
alias -g G='| grep'

# C で標準出力をクリップボードにコピーする
# mollifier delta blog : http://mollifier.hatenablog.com/entry/20100317/p1
if which pbcopy >/dev/null 2>&1 ; then
		# Mac
		alias -g C='| pbcopy'
elif which xsel >/dev/null 2>&1 ; then
		# Linux xsel
		alias -g C='| xsel --input --clipboard'
elif which xclip >/dev/null 2>&1 ; then
		# Linux xclip
		alias -g C='| xclip -selection clipboard'
fi

# bundle
alias be="bundle exec "
alias bi="bundle install "
alias rails="bundle exec rails"
alias rails-s="bundle exec rails s -p 3001"
alias rspec="bundle exec rspec"
# node
alias nir="ni run "
alias niu="ni upgrade-interactive "
alias nil="ni run lint "
alias sortp="npx sort-package-json"
# bun
alias bunup="bunx npm-check-updates -ui"
# cloud functions コマンド alias
alias cfunc='functions-emulator'
# docker alias
alias d="docker"
alias dc="docker-compose"
########################################
# OS 別の設定
case ${OSTYPE} in
		darwin*)
				#Mac用の設定
				export CLICOLOR=1
				alias ls='ls -G -F'
				eval "$(/opt/homebrew/bin/brew shellenv)"
				;;
		linux*)
				#Linux用の設定
				alias ls='ls -F --color=auto'
				alias open="xdg-open"
				# Ruby InstallのOpenSSL場所指定
				export RUBY_CONFIGURE_OPTS="--with-openssl-dir=/usr"
				;;
esac
########################################
# zplug
export ZPLUG_HOME=$HOME/.zplug
source $ZPLUG_HOME/init.zsh
zplug "b4b4r07/enhancd", use:init.sh
zplug "zsh-users/zsh-syntax-highlighting", defer:2
zplug "zsh-users/zsh-history-substring-search"
zplug "zsh-users/zsh-completions"
zplug "azu/ni.zsh", use:ni.zsh
zplug load
export ENHANCD_FILTER="fzf"
## 未インストールのプラグインをインストール
if ! zplug check --verbose; then
		printf 'Install? [y/N]: '
		if read -q; then
			echo; zplug install
		fi
fi
# コマンドにパスを通し、プラグインを読み込む
zplug load

function select-history() {
	BUFFER=$(history -n -r 1 | fzf --no-sort +m --query "$LBUFFER" --prompt="History > ")
	CURSOR=$#BUFFER
}
zle -N select-history
bindkey '^r' select-history

function ghq-fzf() {
	local src=$(ghq list | fzf --preview "ls -laTp $(ghq root)/{} | tail -n+4 | awk '{print \$9\"/\"\$6\"/\"\$7 \" \" \$10}'")
	if [ -n "$src" ]; then
		BUFFER="cd $(ghq root)/$src"
		zle accept-line
	fi
	zle -R -c
}
zle -N ghq-fzf
bindkey '^t' ghq-fzf

###-begin-npm-completion-###
#
# npm command completion script
#
# Installation: npm completion >> ~/.bashrc  (or ~/.zshrc)
# Or, maybe: npm completion > /usr/local/etc/bash_completion.d/npm
#

if type complete &>/dev/null; then
	_npm_completion () {
		local words cword
		if type _get_comp_words_by_ref &>/dev/null; then
			_get_comp_words_by_ref -n = -n @ -n : -w words -i cword
		else
			cword="$COMP_CWORD"
			words=("${COMP_WORDS[@]}")
		fi

		local si="$IFS"
		if ! IFS=$'\n' COMPREPLY=($(COMP_CWORD="$cword" \
													 COMP_LINE="$COMP_LINE" \
													 COMP_POINT="$COMP_POINT" \
													 npm completion -- "${words[@]}" \
													 2>/dev/null)); then
			local ret=$?
			IFS="$si"
			return $ret
		fi
		IFS="$si"
		if type __ltrim_colon_completions &>/dev/null; then
			__ltrim_colon_completions "${words[cword]}"
		fi
	}
	complete -o default -F _npm_completion npm
elif type compdef &>/dev/null; then
	_npm_completion() {
		local si=$IFS
		compadd -- $(COMP_CWORD=$((CURRENT-1)) \
								 COMP_LINE=$BUFFER \
								 COMP_POINT=0 \
								 npm completion -- "${words[@]}" \
								 2>/dev/null)
		IFS=$si
	}
	compdef _npm_completion npm
elif type compctl &>/dev/null; then
	_npm_completion () {
		local cword line point words si
		read -Ac words
		read -cn cword
		let cword-=1
		read -l line
		read -ln point
		si="$IFS"
		if ! IFS=$'\n' reply=($(COMP_CWORD="$cword" \
											 COMP_LINE="$line" \
											 COMP_POINT="$point" \
											 npm completion -- "${words[@]}" \
											 2>/dev/null)); then

			local ret=$?
			IFS="$si"
			return $ret
		fi
		IFS="$si"
	}
	compctl -K _npm_completion npm
fi
###-end-npm-completion-###

# bun completions
[ -s $HOME/.bun/_bun ] && source $HOME/.bun/_bun

# asdf completions
fpath=(${ASDF_DIR}/completions $fpath)
