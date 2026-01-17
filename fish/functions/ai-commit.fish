function ai-commit --description 'Generate commit message using AI (LM Studio)'
    # dotsfileのパスを取得
    set -l script_path ~/ghq/github.com/RoyMcCrain/dotsfile/scripts/ai-commit.sh

    if test -f $script_path
        bash $script_path $argv
    else
        echo "Error: ai-commit.sh not found at $script_path" >&2
        return 1
    end
end
