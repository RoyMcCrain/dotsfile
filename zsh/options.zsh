export LANG=ja_JP.UTF-8
export GIT_EDITOR=nvim
export EDITOR=nvim
export TERM=xterm-256color
# pnpm
if [ -f "$HOME/.local/share/pnpm/pnpm" ]; then
  export PNPM_HOME="$HOME/.local/share/pnpm"
  export PATH="$PNPM_HOME:$PATH"
fi

# bun
if [ -d "$HOME/.bun/bin" ]; then
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  source "$HOME/.bun/_bun"
fi

# asdf
if [ -d "$HOME/.asdf" ]; then
  export ASDF_DATA_DIR="${ASDF_DATA_DIR:-$HOME/.asdf}"
  export PATH="${ASDF_DATA_DIR}/shims:$PATH"
fi
 
# JAVA_HOME
if [ -f "$HOME/.asdf/plugins/java/set-java-home.zsh" ]; then
. $HOME/.asdf/plugins/java/set-java-home.zsh
fi

# pipの設定
if [ -d "$HOME/.local/bin" ]; then
  export PATH=$PATH:$HOME/.local/bin
fi

# sdkmanの設定
export SDKMAN_DIR="$HOME/.sdkman"
[[ -s "$HOME/.sdkman/bin/sdkman-init.sh" ]] && source "$HOME/.sdkman/bin/sdkman-init.sh"

# direnv
if command -v direnv >/dev/null 2>&1; then
  eval "$(direnv hook zsh)"
fi

if [ -d "/home/linuxbrew" ]; then
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
fi

# claude
if [-d "$HOME/.claude/local/claude"]; then
  alias claude="/home/roy/.claude/local/claude"
fi

# 色を使用出来るようにする
autoload -Uz colors && colors
# ヒストリの設定
HISTFILE=$HOME/.zsh_history
HISTSIZE=1000000
SAVEHIST=1000000

# プロンプト
# 1行表示
# PROMPT="%~ %# "
# 2行表示
PROMPT="%F{163}λ%f "

# 単語の区切り文字を指定する
autoload -Uz select-word-style
select-word-style default
# ここで指定した文字は単語区切りとみなされる
# / も区切りと扱うので、^W でディレクトリ１つ分を削除できる
zstyle ':zle:*' word-chars " /=;@:{},|"
zstyle ':zle:*' word-style unspecified

# 補完機能を有効にする
autoload -Uz compinit && compinit

# 補完で小文字でも大文字にマッチさせる
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'

########################################
# vcs_info
autoload -Uz vcs_info
autoload -Uz add-zsh-hook

zstyle ':vcs_info:*' enable git svn hg bzr
zstyle ':vcs_info:*' check-for-changes true
zstyle ':vcs_info:*' stagedstr '%F{green}!'
zstyle ':vcs_info:*' unstagedstr '%F{yellow}+'

zstyle ':vcs_info:*' formats '%c%u%F{green}%s:%b%f'
zstyle ':vcs_info:*' actionformats '%%c%uF{red}%s:%b|%a%f'

function _update_vcs_info_msg() {
    LANG=en_US.UTF-8 vcs_info
    RPROMPT="${vcs_info_msg_0_}"
}
add-zsh-hook precmd _update_vcs_info_msg

########################################
# オプション
# 日本語ファイル名を表示可能にする
setopt print_eight_bit
# beep を無効にする
setopt no_beep
# フローコントロールを無効にする
setopt no_flow_control
# Ctrl+Dでzshを終了しない
setopt ignore_eof
# cd したら自動的にpushdする
setopt auto_pushd
# 重複したディレクトリを追加しない
setopt pushd_ignore_dups
# 同時に起動したzshの間でヒストリを共有する
setopt share_history
# 同じコマンドをヒストリに残さない
setopt hist_ignore_all_dups
# スペースから始まるコマンド行はヒストリに残さない
setopt hist_ignore_space
# ヒストリに保存するときに余分なスペースを削除する
setopt hist_reduce_blanks
# 高機能なワイルドカード展開を使用する
setopt extended_glob
########################################
# OS 別の設定
case ${OSTYPE} in
    darwin*)
        #Mac用の設定
        export CLICOLOR=1
        if [ -f /opt/homebrew/bin/brew ]; then
          eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
        ;;
    linux*)
        #Linux用の設定
        # Ruby InstallのOpenSSL場所指定
        export RUBY_CONFIGURE_OPTS="--with-openssl-dir=/usr"
        ;;
esac
