abbr -f --quiet js='jobs'
# fg %1 でそのjobsの復帰

if type eza >/dev/null 2>&1; then
	abbr -f --quiet ls='eza -TF -L=1 --icons'
	abbr -f --quiet la='eza -aTF -L=1 --icons'
	abbr -f --quiet ll='eza -lTF -L=1 --icons'
	abbr -f --quiet lla='eza -alTF -L=1 --icons'
else
	abbr -f --quiet la='ls -a'
	abbr -f --quiet ll='ls -lh'
	abbr -f --quiet lla='ls -lha'
fi

abbr -f --quiet rm='rm -ri'
abbr -f --quiet rmf='rm -rf'
abbr -f --quiet cp='cp -i'
abbr -f --quiet mv='mv -i'

abbr -f --quiet mkdir='mkdir -p'

abbr -f --quiet a="nvim"
abbr -f --quiet code="code -n ."
abbr -f --quiet g="git"

# bundle
abbr -f --quiet be="bundle exec "
abbr -f --quiet bi="bundle install "
abbr -f --quiet rails="bundle exec rails"
abbr -f --quiet rails-s="bundle exec rails s -p 3001"
abbr -f --quiet rspec="bundle exec rspec"
# node
abbr -f --quiet nir="ni run "
abbr -f --quiet niu="ni upgrade-interactive "
abbr -f --quiet nil="ni run lint "
abbr -f --quiet sortp="npx sort-package-json"
# bun
abbr -f --quiet bunup="bunx npm-check-updates -ui"
# docker
abbr -f --quiet d="docker"
abbr -f --quiet dc="docker-compose"

case ${OSTYPE} in
		darwin*)
				#Mac用の設定
				;;
		linux*)
				#Linux用の設定
				abbr -f --quiet open="xdg-open"
				;;
esac

ghq-get-cd() {
  ghq get "$1" && cd "$(ghq list --exact --full-path "$1")"
}

abbr -f --quiet "ghq get"="ghq-get-cd"

abbr -f --quiet "git sw"="git switch"
abbr -f --quiet "git rs"="git restore"
abbr -f --quiet "git cm"="git commit"
abbr -f --quiet "git st"="git status"
abbr -f --quiet "git br"="git branch"
abbr -f --quiet "git lg"="git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit --date=relative"
abbr -f --quiet "git mt"="git mergetool"
abbr -f --quiet "git dt"="git difftool"
abbr -f --quiet "git pl"="git pull"
abbr -f --quiet "git pp"="git pull --prune"
abbr -f --quiet "git ps"="git push"

abbr -f --quiet "asdf neovim update"='asdf uninstall neovim nightly && asdf install neovim nightly'
