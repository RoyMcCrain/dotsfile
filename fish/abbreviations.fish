# Fish abbreviations configuration
# zsh-abbrからの移行版 ✨

# Basic commands
abbr js 'jobs'
# fg %1 でそのjobsの復帰

# eza（または ls）のエイリアス
# s/sa/ss/ssa は Cuyz配列で l が小指位置のため追加
if command -q eza
    abbr s 'eza -TF -L=1 --icons'
    abbr sa 'eza -aTF -L=1 --icons'
    abbr ss 'eza -lTF -L=1 --icons'
    abbr ssa 'eza -alTF -L=1 --icons'
    abbr ls 'eza -TF -L=1 --icons'
    abbr la 'eza -aTF -L=1 --icons'
    abbr ll 'eza -lTF -L=1 --icons'
    abbr lla 'eza -alTF -L=1 --icons'
else
    abbr s 'ls'
    abbr sa 'ls -a'
    abbr ss 'ls -lh'
    abbr ssa 'ls -lha'
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
abbr i 'nvim'
abbr code 'code -n .' # vscode
abbr exp 'explorer.exe .' # explorer

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

# Git
abbr g 'git'
abbr ac 'ai-commit'
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

# jj (jujutsu)
abbr j 'jj'
abbr l 'lazyjj'
abbr -p anywhere ne 'new'
abbr -p anywhere ed 'edit'
abbr -p anywhere sq 'squash'
abbr -p anywhere sqi 'squash -i'
abbr -p anywhere bo 'bookmark'
abbr -p anywhere bos 'bookmark set'
abbr -p anywhere bol 'bookmark list'
abbr -p anywhere ab 'abandon'
abbr -p anywhere gp 'git push'
abbr -p anywhere gpc 'git push -c @'
abbr -p anywhere gf 'git fetch'

# Fish specific
abbr sf 'source ~/.config/fish/config.fish'
abbr rc 'restore-command'  # 保存したコマンドを復元

# serena
abbr serena-index 'uvx --from git+https://github.com/oraios/serena serena project index'
