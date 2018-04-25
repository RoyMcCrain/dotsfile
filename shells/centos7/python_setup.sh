#!/bin/sh

# dein用pyenv設定
git clone https://github.com/pyenv/pyenv.git ~/.pyenv

# bash_profileに環境変数挿入
echo 'export PATH="$HOME/.pyenv/bin:$PATH"' >> ~/.bash_profile
echo 'eval "$(pyenv init -)"' >> ~/.bash_profile

# 再読み込み
source ~/.bash_profile

# pythonのインストール
env PYTHON_CONFIGURE_OPTS="--enable-shared" pyenv install 3.6.4
pyenv global 3.6.4

# pipでneovimインストール
pip install --upgrade neovim

