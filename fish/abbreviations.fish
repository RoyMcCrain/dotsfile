# Fish abbreviations configuration
# zsh-abbrからの移行版 ✨

# Basic commands
abbr js 'jobs'
# fg %1 でそのjobsの復帰

# eza（または ls）のエイリアス
if command -q eza
    abbr ls 'eza -TF -L=1 --icons'
    abbr la 'eza -aTF -L=1 --icons'
    abbr ll 'eza -lTF -L=1 --icons'
    abbr lla 'eza -alTF -L=1 --icons'
else
    abbr la 'ls -a'
    abbr ll 'ls -lh'
    abbr lla 'ls -lha'
end

# Safe file operations
abbr rm 'rm -ri'
abbr rmf 'rm -rf'
abbr cp 'cp -i'
abbr mv 'mv -i'
abbr mkdir 'mkdir -p'

# Editor and tools
abbr a 'nvim'
abbr code 'code -n .' # vscode
abbr exp 'explorer.exe .' # explorer

# Bundle (Ruby)
abbr be 'bundle exec '
abbr bi 'bundle install '
abbr rails 'bundle exec rails'
abbr rails-s 'bundle exec rails s -p 3001'
abbr rspec 'bundle exec rspec'

abbr sortp 'npx sort-package-json'

# pnpm
abbr p 'pnpm'
abbr pr 'pnpm run'
abbr pi 'pnpm i'
abbr pa 'pnpm add'
abbr px 'pnpm dlx'

# Docker
abbr d 'docker'
abbr dc 'docker compose'
abbr dcp 'docker compose exec php'

# ghq shortcuts
abbr ghq-get 'ghq-get-cd'
abbr gc 'ghq-cd'  # ghq cd shortcut

# OS specific
switch (uname)
    case Linux
        abbr open 'xdg-open'
    case Darwin
        # Mac用の設定（必要に応じて追加）
end

abbr g 'git'
# Git abbreviations
abbr sw 'switch'
abbr rs 'restore'
abbr rb 'rebase'
abbr cm 'commit'
abbr st 'status'
abbr br 'branch'
abbr lg 'log --graph --pretty=format:\'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset\' --abbrev-commit --date=relative'
abbr mt 'mergetool'
abbr dt 'difftool'
abbr pl 'pull'
abbr pp 'pull --prune'
abbr ps 'push'

# Fish specific
abbr sf 'source ~/.config/fish/config.fish'
abbr rc 'restore-command'  # 保存したコマンドを復元
