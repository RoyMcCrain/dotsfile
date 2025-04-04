# dotsfile

いろいろ設定集

## init

必要そうなやつをaptでいれる
```bash
sudo apt update && sudo apt install -y build-essential zsh zip language-pack-ja
```

zsh をログインシェルにする
```bash
chsh -s $(which zsh)
```

## ghの設定

https://github.com/cli/cli/blob/trunk/docs/install_linux.md

```bash
(type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y)) \
	&& sudo mkdir -p -m 755 /etc/apt/keyrings \
        && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        && cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
	&& sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
	&& echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
	&& sudo apt update \
	&& sudo apt install gh -y
```

ghのインストール後

```bash
gh auth login
```

Githubとsshができるようにする

## homebrewのインストール

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

https://brew.sh/ja/

最新のインストール方法を確認する


## ghqの設定

```bash
brew install ghq
```

https://github.com/x-motemen/ghq?tab=readme-ov-file#macos

## dotsfilesのclone

```bash
ghq get git@github.com:RoyMcCrain/dotsfile.git
cd ~/ghq/github.com/RoyMcCrain/dotsfile
```

## asdf

https://asdf-vm.com/guide/getting-started.html#install-asdf

Versionは最新のものを使う
```bash
brew install asdf
```

## asdf_init_plugin

```bash
chmod +x ./scripts/build_env/asdf_init_plugin.sh
./scripts/build_env/asdf_init_plugin.sh
```

上記で、asdf plugin add を行う


## asdf_install_plugin

```bash
chmod +x ./scripts/build_env/asdf_install_plugin.sh
./scripts/build_env/asdf_install_plugin.sh
```

## 不必要なaptで入れたgolang削除

```bash
sudo apt remove golang
sudo rm -rf ~/go
```
ディレクトリは要確認


## antigen(zshのプラグインマネージャー)

[antigen](https://github.com/zsh-users/antigen)

```bash
git clone https://github.com/zsh-users/antigen.git ~/.antigen
```

## create_symlink

```bash
chmod +x ./scripts/build_env/create_symlink.sh
./scripts/build_env/create_symlink.sh
```

上記で、シンボリックリンクを作成できる

## eza
https://github.com/eza-community/eza

https://github.com/eza-community/eza/blob/main/INSTALL.md#debian-and-ubuntu

```bash
sudo mkdir -p /etc/apt/keyrings
wget -qO- https://raw.githubusercontent.com/eza-community/eza/main/deb.asc | sudo gpg --dearmor -o /etc/apt/keyrings/gierens.gpg
echo "deb [signed-by=/etc/apt/keyrings/gierens.gpg] http://deb.gierens.de stable main" | sudo tee /etc/apt/sources.list.d/gierens.list
sudo chmod 644 /etc/apt/keyrings/gierens.gpg /etc/apt/sources.list.d/gierens.list
sudo apt update
sudo apt install -y eza
```

## zshrcの読み込み

```bash
source ~/.zshrc
```

## xsel
```bash
sudo apt install xsel
```

## WSL-Hello-sudo

https://github.com/nullpo-head/WSL-Hello-sudo

```bash
wget http://github.com/nullpo-head/WSL-Hello-sudo/releases/latest/download/release.tar.gz
tar xvf release.tar.gz
cd release
./install.sh
```

```bash
cd ../
rm -fr ./release.tar.gz ./release
```




# memo
## denopsでライブラリのエラー
```bash
[denops] Failed to load plugin 'dpp': TypeError: error sending request for url (https://jsr.io/@std/internal/0.225.1/format.ts):
 http2 error: stream error received: refused stream before processing any application logic                                     
[denops]     at https://jsr.io/@std/assert/0.225.2/assert_array_includes.ts:4:24  
```

```bash
Could not find co
nstraint in the list of versions
```

こんな感じのエラーが起きたら
```bash
rm -fr ~/.cache/deno
rm -fr ~/.cache/dpp
```
をする。なんかdenoのキャッシュが原因で上手くインストールできないときがある。
