# Fish shell configuration
# zshからの移行版 ✨

# 基本パス（source時にPATHが壊れている場合の対策）
set -gx PATH /usr/local/bin /usr/bin /bin /usr/sbin /sbin $PATH

# devboxパス
if test -d "$HOME/.local/bin"
    fish_add_path $HOME/.local/bin
end

# cargo (Rust)
if test -d "$HOME/.cargo/bin"
    fish_add_path $HOME/.cargo/bin
end

# 環境変数
set -gx LANG ja_JP.UTF-8
set -gx GIT_EDITOR nvim
set -gx EDITOR nvim
set -gx TERM xterm-256color
set -gx DFT_DISPLAY side-by-side-show-both

# API keys (Bitwarden→Keychainキャッシュ。更新は sync-key、新規は add-key が下行に自動追記)
# add-key が新規アイテムを作る Bitwarden フォルダ
set -gx BW_KEY_FOLDER "env"
set -l api_key_items fugu-api-key firecrawl-api-key devin-api-key
for item in $api_key_items
    set -l val (security find-generic-password -s $item -w 2>/dev/null)
    test -n "$val"; and set -gx (string upper (string replace -a - _ $item)) $val
end

# devbox
# SSH の Match exec が $SHELL を execve するため絶対パスを設定する（裸の "fish" だと exec 失敗）
set -gx SHELL (status fish-path)
devbox global shellenv | source

# JAVA_HOME (devbox's temurin)
if command -q java
    set -l java_path (command -v java)
    if test -L $java_path
        set java_path (readlink -f $java_path)
    end
    set -gx JAVA_HOME (string replace -r '/bin/java$' '' $java_path)
end

# npm global packages path
if test -d "$HOME/.local/share/npm-global/bin"
    fish_add_path $HOME/.local/share/npm-global/bin
end

# direnv
if command -q direnv
    direnv hook fish | source
end

# jj dynamic completions
if command -q jj
    COMPLETE=fish jj | source
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
    if command -q jj; and test -d .jj
        set_color green
        set -l bm (jj log -r @ -T 'bookmarks' --no-graph 2>/dev/null | string replace -ra '[*?]' '')
        if test -z "$bm"
            set bm (jj log -r @- -T 'bookmarks' --no-graph 2>/dev/null | string replace -ra '[*?]' '')
        end
        printf '%s' $bm
        set_color normal
    else if command -q git
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
source $__fish_config_dir/abbreviations.fish

# fzf設定を読み込み
source $__fish_config_dir/fzf.fish

# ghq-get-cd function (fishバージョン)
function ghq-get-cd
    ghq get $argv[1]
    and cd (ghq list --exact --full-path $argv[1])
    rm -f "$HOME/.cache/ghq-fzf-list"  # ghq-fzfキャッシュを無効化（次回再生成）
end

# ghq get の略語用に関数を設定
abbr ghq-get 'ghq-get-cd'

# jj describe with AI commit message
function aid
    set_color yellow
    echo "メッセージ生成中..."
    set_color normal
    set -l msg (ai-commit -m)
    echo
    set_color green
    echo "生成されたメッセージ:"
    set_color normal
    echo "$msg"
    echo
    jj describe -m "$msg"
end



# gcloud
set -l GCLOUD_PATH "$HOME/.local/google-cloud-sdk/bin"
if not string match -q -- $GCLOUD_PATH $PATH
  set -gx PATH "$GCLOUD_PATH" $PATH
end
# gcloud end

# LM Studio CLI (lms)
if test -d "$HOME/.lmstudio/bin"
    fish_add_path --append $HOME/.lmstudio/bin
end

# SSH 鍵は Bitwarden Desktop の SSH agent で管理する（秘密鍵をディスクに置かない）
# socket の指定は ~/.ssh/config の IdentityAgent に一本化（接続時解決でシェル起動順に依存しない）

