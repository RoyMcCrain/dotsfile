abbr --quiet js='jobs'
# fg %1 でそのjobsの復帰

if command -v eza >/dev/null 2>&1; then
	abbr --quiet ls='eza -TF -L=1 --icons'
	abbr --quiet la='eza -aTF -L=1 --icons'
	abbr --quiet ll='eza -lTF -L=1 --icons'
	abbr --quiet lla='eza -alTF -L=1 --icons'
else
	abbr --quiet la='ls -a'
	abbr --quiet ll='ls -lh'
	abbr --quiet lla='ls -lha'
fi

abbr --quiet rm='rm -ri'
abbr --quiet rmf='rm -rf'
abbr --quiet cp='cp -i'
abbr --quiet mv='mv -i'

abbr --quiet mkdir='mkdir -p'

abbr --quiet a="nvim"
abbr --quiet code="code -n ."
abbr --quiet g="git"

# bundle
abbr --quiet be="bundle exec "
abbr --quiet bi="bundle install "
abbr --quiet rails="bundle exec rails"
abbr --quiet rails-s="bundle exec rails s -p 3001"
abbr --quiet rspec="bundle exec rspec"
# node
abbr --quiet nir="ni run "
abbr --quiet niu="ni upgrade-interactive "
abbr --quiet nil="ni run lint "
abbr --quiet sortp="npx sort-package-json"
# bun
abbr --quiet bunup="bunx npm-check-updates -ui"
# docker
abbr --quiet d="docker"
abbr --quiet dc="docker-compose"

case ${OSTYPE} in
		darwin*)
				#Mac用の設定
				;;
		linux*)
				#Linux用の設定
				abbr --quiet open="xdg-open"
				;;
esac

ghq-get-cd() {
  ghq get "$1" && cd "$(ghq list --exact --full-path "$1")"
}

abbr --quiet "ghq get"="ghq-get-cd"

abbr --quiet "git sw"="git switch"
abbr --quiet "git rs"="git restore"
abbr --quiet "git cm"="git commit"
abbr --quiet "git st"="git status"
abbr --quiet "git br"="git branch"
abbr --quiet "git lg"="git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit --date=relative"
abbr --quiet "git mt"="git mergetool"
abbr --quiet "git dt"="git difftool"
abbr --quiet "git pl"="git pull"
abbr --quiet "git pp"="git pull --prune"
abbr --quiet "git ps"="git push"
