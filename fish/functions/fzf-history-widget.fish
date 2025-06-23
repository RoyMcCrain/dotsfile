function fzf-history-widget --description 'Search command history with fzf'
    set -l selected_command (
        history | fzf --height 40% --layout reverse --border \
        --preview 'echo {}' --preview-window up:3:wrap
    )
    
    if test -n "$selected_command"
        commandline -- $selected_command
        commandline -f repaint
    end
end
