abbr -f --quieter js='jobs'
# fg %1 でそのjobsの復帰

if type eza >/dev/null 2>&1; then
  abbr -f --quieter ls='eza -TF -L=1 --icons'
  abbr -f --quieter la='eza -aTF -L=1 --icons'
  abbr -f --quieter ll='eza -lTF -L=1 --icons'
  abbr -f --quieter lla='eza -alTF -L=1 --icons'
else
  abbr -f --quieter la='ls -a'
  abbr -f --quieter ll='ls -lh'
  abbr -f --quieter lla='ls -lha'
fi

abbr -f --quieter rm='rm -ri'
abbr -f --quieter rmf='rm -rf'
abbr -f --quieter cp='cp -i'
abbr -f --quieter mv='mv -i'

abbr -f --quieter mkdir='mkdir -p'

abbr -f --quieter a="nvim"
abbr -f --quieter code="code -n ." # vscode
abbr -f --quieter exp="explorer.exe ." # explorer
abbr -f --quieter g="git"

# bundle
abbr -f --quieter be="bundle exec "
abbr -f --quieter bi="bundle install "
abbr -f --quieter rails="bundle exec rails"
abbr -f --quieter rails-s="bundle exec rails s -p 3001"
abbr -f --quieter rspec="bundle exec rspec"
# node
abbr -f --quieter nir="ni run "
abbr -f --quieter niu="ni upgrade-interactive "
abbr -f --quieter nil="ni run lint "
abbr -f --quieter nid="ni run dlx "
abbr -f --quieter sortp="npx sort-package-json"
# pnpm
abbr -f --quieter pn="pnpm"
# docker
abbr -f --quieter d="docker"
abbr -f --quieter dc="docker compose"
#dockerのphp
abbr -f --quiet dcp="docker compose exec php"

case ${OSTYPE} in
    darwin*)
        #Mac用の設定
        ;;
    linux*)
        #Linux用の設定
        abbr -f --quieter open="xdg-open"
        ;;
esac

ghq-get-cd() {
  ghq get "$1" && cd "$(ghq list --exact --full-path "$1")"
}

abbr -f --quieter "ghq get"="ghq-get-cd"

abbr -f --quieter "git sw"="git switch"
abbr -f --quieter "git rs"="git restore"
abbr -f --quieter "git cm"="git commit"
abbr -f --quieter "git st"="git status"
abbr -f --quieter "git br"="git branch"
abbr -f --quieter "git lg"="git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit --date=relative"
abbr -f --quieter "git mt"="git mergetool"
abbr -f --quieter "git dt"="git difftool"
abbr -f --quieter "git pl"="git pull"
abbr -f --quieter "git pp"="git pull --prune"
abbr -f --quieter "git ps"="git push"

abbr -f --quieter "sz"="source ~/.zshrc"
