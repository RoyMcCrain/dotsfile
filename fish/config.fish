# Fish shell configuration
# zshからの移行版 ✨

# 環境変数
set -gx LANG ja_JP.UTF-8
set -gx GIT_EDITOR nvim
set -gx EDITOR nvim
set -gx TERM xterm-256color

# devbox
set -gx SHELL fish
devbox global shellenv --init-hook | source

if test -d "$HOME/.local/bin"
    fish_add_path $HOME/.local/bin
end

# direnv
if command -q direnv
    direnv hook fish | source
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

# gcloud
set -l GCLOUD_PATH "$HOME/.local/google-cloud-sdk/bin"
if not string match -q -- $GCLOUD_PATH $PATH
  set -gx PATH "$GCLOUD_PATH" $PATH
end
# gcloud end

# Added by LM Studio CLI (lms)
set -gx PATH $PATH /Users/roy/.lmstudio/bin
# End of LM Studio CLI section

