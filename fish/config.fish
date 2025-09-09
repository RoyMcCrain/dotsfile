# Fish shell configuration
# zshからの移行版 ✨

# 環境変数
set -gx LANG ja_JP.UTF-8
set -gx GIT_EDITOR nvim
set -gx EDITOR nvim
set -gx TERM xterm-256color

# pnpm
if test -f "$HOME/.local/share/pnpm/pnpm"
    set -gx PNPM_HOME "$HOME/.local/share/pnpm"
    fish_add_path $PNPM_HOME
end

# bun
if test -d "$HOME/.bun/bin"
    set -gx BUN_INSTALL "$HOME/.bun"
    fish_add_path $BUN_INSTALL/bin
end

# asdf
if test -d "$HOME/.asdf"
    set -gx ASDF_DATA_DIR "$HOME/.asdf"
    fish_add_path $ASDF_DATA_DIR/shims
    
    # asdf.fishファイルが存在する場合のみ読み込み
    if test -f ~/.asdf/asdf.fish
        source ~/.asdf/asdf.fish
    else
        # asdf.fishがない場合は手動で関数を定義
        function asdf
            command asdf $argv
        end
        
        # 基本的な環境変数を設定
        set -gx ASDF_DIR "$HOME/.asdf"
    end
end

# JAVA_HOME (asdf)
if test -f "$HOME/.asdf/plugins/java/set-java-home.fish"
    source "$HOME/.asdf/plugins/java/set-java-home.fish"
end

# pip
if test -d "$HOME/.local/bin"
    fish_add_path $HOME/.local/bin
end

# sdkman
set -gx SDKMAN_DIR "$HOME/.sdkman"
if test -s "$HOME/.sdkman/bin/sdkman-init.sh"
    # sdkmanはbash専用なので、必要な時だけbashで実行
    # fish用の代替手段を使うか、手動でPATHを設定
end

# direnv
if command -q direnv
    direnv hook fish | source
end

# Linuxbrew
if test -d "/home/linuxbrew"
    eval (/home/linuxbrew/.linuxbrew/bin/brew shellenv)
end

# claude
if test -d "$HOME/.claude/local"
    function claude
        $HOME/.claude/local/claude $argv
    end
end

## codex: 共通プロンプトを自動で先頭付与
function codex
    set -l prompt_path "$HOME/ghq/github.com/RoyMcCrain/dotsfile/codex/common-prompt.md"

    # 先頭のオプションとメッセージ本体を分離（最初の非ハイフン引数以降をメッセージ）
    set -l opts
    set -l msg_parts
    set -l found 0
    for a in $argv
        if test $found -eq 0
            if string match -qr '^-.*' -- $a
                set -a opts $a
                continue
            else
                set found 1
            end
        end
        set -a msg_parts $a
    end

    # 実プロンプトがある場合は、共通プロンプトを先頭に付けて渡す
    if test (count $msg_parts) -gt 0 -a -f "$prompt_path"
        set -l merged (string join "\n" (cat "$prompt_path") "" (string join ' ' $msg_parts))
        command codex $opts "$merged"
        return
    end

    # 実プロンプトが無い場合は、参考表示のみして起動
    if test -f "$prompt_path"
        echo "===== Codex Guidelines (auto prepended) ====="
        cat "$prompt_path"
        echo "============================================="
    end
    command codex $argv
end

# Fish specific settings
set fish_greeting ""  # 起動メッセージを非表示

# プロンプト設定（zshから移行）
# %F{163}λ%f の再現
function fish_prompt
    set_color magenta  # %F{163} に相当
    echo -n "λ "       # λ記号とスペース
    set_color normal   # %f に相当（色をリセット）
end

function fish_right_prompt
    # Git情報を表示（fish_git_promptを使用）
    if command -q git
        set_color green
        printf '%s' (fish_git_prompt)
        set_color normal
    end
end

# OS別設定
switch (uname)
    case Darwin
        # Mac用の設定
        set -gx CLICOLOR 1
        if test -f /opt/homebrew/bin/brew
            eval (/opt/homebrew/bin/brew shellenv)
        end
    case Linux
        # Linux用の設定
        set -gx RUBY_CONFIGURE_OPTS "--with-openssl-dir=/usr"
end

# 略語設定を読み込み
source (dirname (status --current-filename))/abbreviations.fish

# fzf設定を読み込み
source (dirname (status --current-filename))/fzf.fish

# ghq-get-cd function (fishバージョン)
function ghq-get-cd
    ghq get $argv[1]
    and cd (ghq list --exact --full-path $argv[1])
end

# ghq get の略語用に関数を設定
abbr ghq-get 'ghq-get-cd'
