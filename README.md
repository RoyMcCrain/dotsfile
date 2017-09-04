# dotsfile
主にnvimの設定

# shellの使い方（CentOS7）
## git
1. `sudo yum -y install git`
## rbenv
1. `rbenv_setup.sh`
2. `exit` 一旦ログアウト
3. `rbenv isntall -v {指定されたバージョン}`
4. `rbenv global {指定されたバージョン}`
- `ruby -v` 確認
- `which ruby` pathの確認
## pyenv (neovim用)
1. `python_setup.sh`
- `python -V` バージョン確認（大文字のV注意）

## zsh
1. `zsh_setup.sh`
2. `chsh -s /bin/zsh`
3. `exit` 一旦ログアウト

## neovim
1. `neovim_setup.sh`
