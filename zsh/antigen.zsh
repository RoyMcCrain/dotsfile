# Antigenの初期化
source $HOME/.antigen/antigen.zsh

# プラグインの追加
antigen bundle b4b4r07/enhancd
export ENHANCD_FILTER="fzf"

antigen bundle zsh-users/zsh-syntax-highlighting@master
antigen bundle zsh-users/zsh-history-substring-search@master
antigen bundle zsh-users/zsh-completions@master
antigen bundle zsh-users/zsh-autosuggestions@master
antigen bundle azu/ni.zsh@main
antigen bundle olets/zsh-abbr@main


# プラグインの適用
antigen apply

