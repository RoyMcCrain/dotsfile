#!/bin/sh

# neovimインストール
sudo yum -y install epel-release
sudo curl -o /etc/yum.repos.d/dperson-neovim-epel-7.repo https://copr.fedorainfracloud.org/coprs/dperson/neovim/repo/epel-7/dperson-neovim-epel-7.repo 
sudo yum -y install neovim

# gem
gem install neovim

# 個人設定構築

sudo yum -y install ctags

git clone https://github.com/RyoMcCrain/dotsfile.git ~/.dotsfile

mkdir -p ~/.config/nvim
cp -r ~/.dotsfile/nvim/ ~/.config/
cp ~/.dotsfile/zshrc ~/.zshrc
cp ~/.dotsfile/ctags ~/.ctags

mkdir -p ~/.config/nvim/swp
mkdir -p ~/.config/nvim/undo
mkdir -p ~/.config/nvim/plugins/repos/github.com/Shougo/dein.vim

# dein
git clone https://github.com/Shougo/dein.vim ~/.config/nvim/plugins/repos/github.com/Shougo/dein.vim

echo "一旦ログアウトして、:call dein#install()をためしてください。"
