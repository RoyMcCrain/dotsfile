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

## codex: 共通プロンプトを自動で先頭付与
function codex
    set -l prompt_path "$HOME/ghq/github.com/RoyMcCrain/dotsfile/codex/common-prompt.md"
    set -l argc (count $argv)
    set -l idx 1
    set -l first_nonopt 0

    while test $idx -le $argc
        set -l token $argv[$idx]

        if test "$token" = "--"
            set first_nonopt (math "$idx + 1")
            break
        end

        if string match -qr '^-.*' -- $token
            if contains -- $token -c --config -i --image -m --model -p --profile -s --sandbox -a --ask-for-approval -C --cd
                if not string match -q '*=*' -- $token
                    set idx (math "$idx + 1")
                end
            end
            set idx (math "$idx + 1")
            continue
        end

        set first_nonopt $idx
        break
    end

    set -l msg_start $first_nonopt
    set -l msg_end 0
    set -l cmd_index 0

    if test $msg_start -gt 0 -a $msg_start -le $argc
        set -l subcommands exec e login logout mcp proto p completion debug apply a resume help
        set -l i $msg_start
        while test $i -le $argc
            set -l part $argv[$i]
            if contains -- $part $subcommands
                set cmd_index $i
                set msg_end (math "$i - 1")
                break
            end
            set i (math "$i + 1")
        end
        if test $cmd_index -eq 0
            set msg_end $argc
        end
    end

    set -l message_count 0
    if test $msg_start -gt 0 -a $msg_end -ge $msg_start
        set message_count (math "$msg_end - $msg_start + 1")
    end

    if test $message_count -gt 0 -a -f "$prompt_path"
        set -l before_count (math "$msg_start - 1")
        set -l prefix
        if test $before_count -gt 0
            set prefix $argv[1..$before_count]
        end

        set -l suffix_start
        if test $cmd_index -gt 0
            set suffix_start $cmd_index
        else if test $msg_end -lt $argc
            set suffix_start (math "$msg_end + 1")
        end

        set -l suffix
        if set -q suffix_start
            set suffix $argv[$suffix_start..$argc]
        end

        set -l user_msg (string join ' ' $argv[$msg_start..$msg_end])
        set -l merged (string join "\n" (cat "$prompt_path") "" $user_msg)
        command codex $prefix "$merged" $suffix
        return
    end

    if test $argc -eq 0 -a -f "$prompt_path"
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

# pnpm
set -gx PNPM_HOME "/home/roy/.local/share/pnpm"
if not string match -q -- $PNPM_HOME $PATH
  set -gx PATH "$PNPM_HOME" $PATH
end
# pnpm end
