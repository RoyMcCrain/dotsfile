# fzf configuration for fish
# Ctrl+T でファイル検索、Ctrl+R で履歴検索など

# fzfがインストールされているかチェック
if command -q fzf
    
    # fzf fish integration
    # fzf 0.48+ はインストール元（devbox/apt/Homebrew）に関わらず
    # key bindings と補完を自前で生成できる
    fzf --fish | source
    
    # fzf設定
    set -gx FZF_DEFAULT_OPTS '
        --height 40% 
        --layout reverse 
        --border 
        --preview "bat --color=always --style=numbers --line-range=:500 {}" 
        --preview-window right:50%:wrap
        --bind "ctrl-u:preview-page-up,ctrl-d:preview-page-down"
    '
    
    # fzf用のコマンド設定
    set -gx FZF_CTRL_T_COMMAND 'find . -type f -not -path "*/\.git/*" -not -path "*/node_modules/*" -not -path "*/\.next/*"'
    set -gx FZF_ALT_C_COMMAND 'find . -type d -not -path "*/\.git/*" -not -path "*/node_modules/*" -not -path "*/\.next/*"'
end
