function fzf-file-widget --description 'Find files with fzf'
    set -l cmd (commandline --current-token)
    
    # fzfでファイルを選択
    set -l selected_file (
        find . -type f -not -path "*/\.git/*" -not -path "*/node_modules/*" \
        | fzf --height 40% --layout reverse --border \
        --preview 'bat --color=always --style=numbers --line-range=:500 {}' \
        --preview-window right:50%:wrap
    )
    
    if test -n "$selected_file"
        commandline --current-token -- (string escape $selected_file)
        commandline -f repaint
    end
end
