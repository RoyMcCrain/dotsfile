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

if test -d "$HOME/.local/bin"
    fish_add_path $HOME/.local/bin
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

# pnpm
set -gx PNPM_HOME "/home/roy/.local/share/pnpm"
if not string match -q -- $PNPM_HOME $PATH
  set -gx PATH "$PNPM_HOME" $PATH
end
# pnpm end

# gcloud
set -l GCLOUD_PATH "$HOME/.local/google-cloud-sdk/bin"
if not string match -q -- $GCLOUD_PATH $PATH
  set -gx PATH "$GCLOUD_PATH" $PATH
end
# gcloud end

# Added by LM Studio CLI (lms)
set -gx PATH $PATH /Users/roy/.lmstudio/bin
# End of LM Studio CLI section

