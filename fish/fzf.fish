# fzf configuration for fish
# Ctrl+T でファイル検索、Ctrl+R で履歴検索など

# fzfがインストールされているかチェック
if command -q fzf
    
    # fzf fish integration
    # fzf 0.48+ はインストール元（devbox/apt/Homebrew）に関わらず
    # key bindings と補完を自前で生成できる
    fzf --fish | source
    
    # 共通設定: プレビューは付けない（履歴検索など不要な場面でbat起動を避ける）
    set -gx FZF_DEFAULT_OPTS '
        --height 40%
        --layout reverse
        --border
    '

    # ファイル検索(Ctrl+T)のときだけbatプレビューを付ける
    set -gx FZF_CTRL_T_OPTS '
        --preview "bat --color=always --style=numbers --line-range=:500 {}"
        --preview-window right:50%:wrap
        --bind "ctrl-u:preview-page-up,ctrl-d:preview-page-down"
    '

    # ディレクトリ検索(Alt+C)はlsの軽いプレビュー
    set -gx FZF_ALT_C_OPTS '
        --preview "ls -la {}"
        --preview-window right:50%:wrap
    '

    # fzf用のコマンド設定（rg/fd は devbox で導入。gitignore考慮で高速）
    set -gx FZF_CTRL_T_COMMAND 'rg --files --hidden --glob "!.git/*"'
    set -gx FZF_ALT_C_COMMAND 'fd --type d --hidden --exclude .git'
end
