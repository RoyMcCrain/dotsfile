# Fish abbreviations configuration
# zsh-abbrからの移行版 ✨

# Basic commands
abbr js 'jobs'
# fg %1 でそのjobsの復帰

# eza（または ls）のエイリアス
# s/sa/ss/ssa は BEAKL-15p配列で l が下段のため追加
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
abbr a 'nvim'
abbr code 'code -n .' # vscode
abbr exp 'explorer.exe .' # explorer

abbr sortp 'npx sort-package-json'

# pnpm
abbr p 'pnpm'
abbr pr 'pnpm run'
abbr pi 'pnpm i'
abbr pa 'pnpm add'
abbr px 'pnpm dlx'

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
abbr ac 'ai-commit'

# jj (jujutsu)
abbr g 'jj'
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
