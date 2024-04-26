alias js='jobs'
# fg %1 でそのjobsの復帰

if command -v exa >/dev/null 2>&1; then
	alias ls='exa -TF -L=1 --icons'
	alias la='exa -aTF -L=1 --icons'
	alias ll='exa -lTF -L=1 --icons'
	alias lla='exa -alTF -L=1 --icons'
else
	alias la='ls -a'
	alias ll='ls -lh'
	alias lla='ls -lha'
fi

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

case ${OSTYPE} in
		darwin*)
				#Mac用の設定
				alias ls='ls -G -F'
				;;
		linux*)
				#Linux用の設定
				alias open="xdg-open"
				;;
esac

ghq-get-cd() {
  ghq get "$1" && cd "$(ghq list --exact --full-path "$1")"
}

alias get="ghq-get-cd"

abbr import-aliases --quiet
abbr import-git-aliases --quiet
