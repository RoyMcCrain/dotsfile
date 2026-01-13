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

devboxでインストール済みの場合はスキップ。

https://github.com/x-motemen/ghq?tab=readme-ov-file#macos

## dotsfilesのclone

```bash
ghq get git@github.com:RoyMcCrain/dotsfile.git
cd ~/ghq/github.com/RoyMcCrain/dotsfile
```

## devbox

https://www.jetify.com/devbox/docs/installing_devbox/

```bash
curl -fsSL https://get.jetify.com/devbox | bash
```

### ツールのインストール

```bash
devbox global add bat direnv eza fish fzf gh ghq go gopls imagemagick jj jq \
  lua-language-server neovim yq zellij nodejs_22 deno bun rustup temurin-bin-21 \
  opentofu uv difftastic
```

### fish設定

config.fishに以下を追加（create_symlinkで自動設定される）：
```fish
set -gx SHELL fish
devbox global shellenv --init-hook | source
```

### npmグローバルパッケージ（Neovim LSP用）

```bash
npm install -g vscode-langservers-extracted yaml-language-server \
  @tailwindcss/language-server vim-language-server graphql-language-service-cli \
  stylelint-lsp typescript neovim @vtsls/language-server @typescript/native-preview
```

## corepack

```bash
corepack enable pnpm
corepack enable yarn
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

devboxでインストール済み。Linuxで個別にインストールする場合：
https://github.com/eza-community/eza/blob/main/INSTALL.md#debian-and-ubuntu

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


## systemdサービス

### tailscale-ssh.service

```bash
mkdir -p ~/.config/systemd/user
ln -sf "$PWD"/scripts/tailscale-ssh.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now tailscale-ssh.service
```

### agentdesk-browser-tools-server.service

```bash
mkdir -p ~/.config/systemd/user
ln -sf "$PWD"/scripts/agentdesk-browser-tools-server.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now agentdesk-browser-tools-server.service
```

devboxのNode.jsを使わない場合は`ExecStart`のパスを環境に合わせて変える。




# Neovim/dpp.vim セットアップ

## 初回セットアップ
Neovimの設定はdpp.vimとDenoを使用してTypeScriptで管理されています。初回起動時は以下の手順でセットアップしてください：

### 1. 設定ファイルとカスタムdduソースの依存関係をキャッシュ
```bash
# dpp.config.ts の依存関係をキャッシュ
cd ~/.config/nvim
deno cache dpp.config.ts

# カスタムdduソースの依存関係をキャッシュ（git_diff.tsなど）
cd ~/.config/nvim/denops/@ddu-sources
deno cache *.ts

# または ghq ディレクトリから実行する場合
cd ~/ghq/github.com/RoyMcCrain/dotsfile
deno cache nvim/dpp.config.ts
```

**注意**: `deno cache`は設定ファイルとカスタムソースで使用されているJSRパッケージをダウンロードしてキャッシュします。これにより、Neovim起動時にネットワークアクセスなしで高速に読み込めるようになります。

### 2. Neovimの起動
```bash
nvim
```
初回起動時にプラグインのインストールが自動的に行われます。プラグインのインストール後、Neovim内で`:call dpp#make_state()`を実行して設定を反映させてください。

## トラブルシューティング

### denopsでライブラリのエラー
```bash
[denops] Failed to load plugin 'dpp': TypeError: error sending request for url (https://jsr.io/@std/internal/0.225.1/format.ts):
 http2 error: stream error received: refused stream before processing any application logic                                     
[denops]     at https://jsr.io/@std/assert/0.225.2/assert_array_includes.ts:4:24  
```

```bash
Could not find co
nstraint in the list of versions
```

### JSRパッケージが見つからないエラー
```
JSR package "@shougo/dpp-vim@~4.1.0" is not installed or doesn't exist.
```

これらのエラーが起きたら以下を実行：
```bash
# キャッシュをクリア
rm -fr ~/.cache/deno
rm -fr ~/.cache/dpp

# プラグインを再インストール（Neovim内で実行）
:call dpp#install()

# 設定ファイルの依存関係を再キャッシュ
cd ~/.config/nvim
deno cache dpp.config.ts

# カスタムdduソースの依存関係を再キャッシュ
cd ~/.config/nvim/denops/@ddu-sources
deno cache *.ts

# Neovim内でdppの状態を再構築
:call dpp#make_state()
```

Denoのキャッシュが原因で上手くインストールできないときがあるため、キャッシュクリア後に再キャッシュすることで解決します。
