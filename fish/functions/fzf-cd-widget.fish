function fzf-cd-widget --description 'Find directories with fzf and change to selected'
    set -l selected_dir (
        find . -type d -not -path "*/\.git/*" -not -path "*/node_modules/*" \
        | fzf --height 40% --layout reverse --border \
        --preview 'ls -la {}' --preview-window right:50%:wrap
    )
    
    if test -n "$selected_dir"
        cd $selected_dir
        commandline -f repaint
    end
end
