function fzf-file-widget --description 'Find files with fzf'
    set -l cmd (commandline --current-token)
    
    # fzfでファイルを選択
    set -l selected_file (
        rg --files --hidden --glob "!.git/*" \
        | fzf --height 40% --layout reverse --border \
        --preview 'bat --color=always --style=numbers --line-range=:500 {}' \
        --preview-window right:50%:wrap
    )
    
    if test -n "$selected_file"
        commandline --current-token -- (string escape $selected_file)
    end
    # 選択/キャンセル問わず再描画（escape時に表示が残るのを防ぐ）
    commandline -f repaint
end
