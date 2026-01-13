# dotsfile

いろいろ設定集

## init

### Mac

Xcode Command Line Toolsをインストール：
```bash
xcode-select --install
```

### Linux (WSL2)

```bash
sudo apt update && sudo apt install -y build-essential zsh zip language-pack-ja
```

## ghのインストール

devboxを先にインストールしてghを追加：
```bash
curl -fsSL https://get.jetify.com/devbox | bash
devbox global add gh
devbox global install
eval "$(devbox global shellenv)"
```

## SSH鍵の設定

```bash
gh auth login
```

SSHを選択してGitHubと接続する

## dotsfilesのclone

```bash
mkdir -p ~/ghq/github.com/RoyMcCrain
git clone git@github.com:RoyMcCrain/dotsfile.git ~/ghq/github.com/RoyMcCrain/dotsfile
cd ~/ghq/github.com/RoyMcCrain/dotsfile
```

## devbox

https://www.jetify.com/devbox/docs/installing_devbox/

ghインストール時に導入済み。

### ツールのインストール

`setup_fish.sh`実行後（devbox.jsonのシンボリックリンク作成後）：

```bash
devbox global install
```

設定は`devbox/devbox.json`で管理。パッケージ追加時は：
```bash
devbox global add <package>
```

### corepack / LSP

`devbox/devbox.json`で管理：
- corepack: `DEVBOX_COREPACK_ENABLED`環境変数で自動有効化
- LSP: nixpkgsパッケージ + init_hookで自動インストール

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
