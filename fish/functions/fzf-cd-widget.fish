function fzf-cd-widget --description 'Find directories with fzf and change to selected'
    set -l selected_dir (
        fd --type d --hidden --exclude .git \
        | fzf --height 40% --layout reverse --border \
        --preview 'ls -la {}' --preview-window right:50%:wrap
    )
    
    if test -n "$selected_dir"
        cd $selected_dir
    end
    # 選択/キャンセル問わず再描画（escape時に表示が残るのを防ぐ）
    commandline -f repaint
end
