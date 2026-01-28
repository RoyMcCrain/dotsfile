function ghq-cd --description 'Change directory to ghq managed repository'
    set -l selected_repo
    set -l ghq_root (ghq root)

    if test (count $argv) -eq 0
        if command -q fzf
            set -l roots_list (ghq list --full-path)
            set selected_repo (ghq list --full-path | roots | while read -l line
                set -l short (string replace "$ghq_root/" '' $line)
                if contains -- $line $roots_list
                    echo $short
                else
                    printf '\033[94m%s\033[0m\n' $short
                end
            end | fzf --ansi)
        else
            echo "Usage: ghq-cd <repository-name> or install fzf for interactive selection"
            return 1
        end
    else
        set selected_repo (ghq list --full-path | roots | string replace "$ghq_root/" '' | grep $argv[1] | head -1)
    end

    if test -n "$selected_repo"
        cd $ghq_root/$selected_repo
    else
        echo "Repository not found: $argv[1]"
        return 1
    end
end
