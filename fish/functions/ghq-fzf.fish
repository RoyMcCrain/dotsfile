function ghq-fzf --description 'Select ghq repository with fzf and change directory'
    # プレビューコマンドを設定
    set -l preview_command
    if command -q eza
        set preview_command "eza -TF --level=1 --icons"
    else
        set preview_command "ls -l"
    end
    
    # fzfでリポジトリを選択（プレビュー付き）
    set -l src (ghq list | fzf --preview "$preview_command (ghq root)/{}")
    
    # 選択されたリポジトリに移動
    if test -n "$src"
        cd (ghq root)/$src
        commandline -f repaint
    end
end
