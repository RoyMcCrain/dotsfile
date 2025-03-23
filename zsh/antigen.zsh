# Antigenの初期化
source $HOME/.antigen/antigen.zsh

antigen bundle zsh-users/zsh-syntax-highlighting@master
antigen bundle zsh-users/zsh-completions@master
antigen bundle zsh-users/zsh-autosuggestions@master
antigen bundle azu/ni.zsh@main
antigen bundle olets/zsh-abbr@main

# プラグインの適用
antigen apply
