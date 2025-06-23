function ghq-cd --description 'Change directory to ghq managed repository'
    set -l selected_repo
    
    if test (count $argv) -eq 0
        # 引数がない場合は、fzfでリポジトリを選択
        if command -q fzf
            set selected_repo (ghq list | fzf)
        else
            echo "Usage: ghq-cd <repository-name> or install fzf for interactive selection"
            return 1
        end
    else
        # 引数がある場合は、部分マッチで検索
        set selected_repo (ghq list | grep $argv[1] | head -1)
    end
    
    if test -n "$selected_repo"
        cd (ghq list --exact --full-path $selected_repo)
    else
        echo "Repository not found: $argv[1]"
        return 1
    end
end
