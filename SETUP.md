# セットアップ手順

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

## シンボリックリンク作成

```bash
chmod +x ./scripts/build_env/setup_fish.sh
./scripts/build_env/setup_fish.sh
chmod +x ./scripts/build_env/create_symlink.sh
./scripts/build_env/create_symlink.sh
```

これにより以下がシンボリックリンクされる：
- nvim, fish, gitconfig等の基本設定
- claude/, codex/, gemini/ のAI Tools設定

## devboxツールのインストール

`setup_fish.sh`実行後（devbox.jsonのシンボリックリンク作成後）：

```bash
devbox global install
```

### npmグローバルパッケージのインストール

初回セットアップ時、またはNode.js更新後に実行：
```bash
devbox global run setup-npm
```

これにより`neovim`, `typescript`, `@typescript/native-preview`がインストールされる。

## Neovim/dpp.vim セットアップ

Neovimの設定はdpp.vimとDenoを使用してTypeScriptで管理されている。

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

### 2. Neovimの起動
```bash
nvim
```
初回起動時にプラグインのインストールが自動的に行われる。プラグインのインストール後、Neovim内で`:call dpp#make_state()`を実行して設定を反映させる。

## トラブルシューティング

### denops/dppでエラーが出る場合

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

Denoのキャッシュが原因で上手くインストールできないときがあるため、キャッシュクリア後に再キャッシュすることで解決する。

## WSL2固有の設定

### xsel
```bash
sudo apt install xsel
```

### WSL-Hello-sudo

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
