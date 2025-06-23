# fzf configuration for fish
# Ctrl+T でファイル検索、Ctrl+R で履歴検索など

# fzfがインストールされているかチェック
if command -q fzf
    
    # fzf fish integration
    # Ubuntu/Debianの場合の標準的なパス
    if test -f /usr/share/doc/fzf/examples/key-bindings.fish
        source /usr/share/doc/fzf/examples/key-bindings.fish
    end
    
    # fzf completions
    if test -f /usr/share/doc/fzf/examples/completion.fish
        source /usr/share/doc/fzf/examples/completion.fish
    end
    
    # Homebrewの場合（Macなど）
    if test -f /opt/homebrew/opt/fzf/shell/key-bindings.fish
        source /opt/homebrew/opt/fzf/shell/key-bindings.fish
    end
    
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
    
    # 手動でキーバインドを設定（統合ファイルが見つからない場合）
    bind \ct ghq-fzf        # Ctrl+T でghqリポジトリ選択
    bind \cr fzf-history-widget
    bind \ec fzf-cd-widget
    bind \cz fancy-ctrl-z   # Ctrl+Z でvim再開機能
    
end

# カスタムfzf関数
# Ctrl+G でファイル検索（元のCtrl+T機能）
bind \cg fzf-file-widget
