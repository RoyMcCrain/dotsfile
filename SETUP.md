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
devbox global add gh jq bash
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
./scripts/build_env/setup.sh
```

これにより以下がシンボリックリンクされる：
- nvim, fish, gitconfig等の基本設定
- claude/, codex/, antigravity/ のAI Tools設定

セットアップは Bash のみを使い、Fish・Zsh・ghq は必要ありません。互換性のため `setup_fish.sh` と `create_symlink.sh` も残していますが、どちらも同じ `setup.sh` を呼び出します。

あわせて `setup.sh` が git の `core.hooksPath` を `.githooks` に設定し、
push 前に `scripts/run_tests.sh`（Bun + Node + bats）が走る pre-push hook が有効になる。

> **注意**: git hooks は `git push` でのみ発火する。`jj git push` は git hooks を実行しないため、
> jj で push する場合は事前に `./scripts/run_tests.sh` を手動で実行すること。

## devboxツールのインストール

`setup.sh`実行後（devbox.jsonのシンボリックリンク作成後）：

```bash
devbox global install
```

### npmグローバルパッケージのインストール

初回セットアップ時、またはNode.js更新後に実行：
```bash
devbox global run setup-npm
```

これにより`neovim`, `typescript`, `@typescript/native-preview`がインストールされる。

Pi と移行済み shared skills の TypeScript テストは Bun、Node テストは Node、シェルテストは Bats で実行する。依存は初回と `pi/agent/package.json` 更新時に入れる：

```bash
bun install --cwd pi/agent
bash scripts/run_tests.sh
```

Bun に Deno の `--allow-*` と同等の実行時サンドボックスはない。テストランナーは隔離された HOME/TMPDIR/XDG を使うが、ファイルシステムやネットワークのサンドボックスではない。nvim/dpp.vim は引き続き Deno を使用する。

## Antigravity CLI (agy)

旧 Gemini CLI の後継。devbox/nixpkgsには無く Homebrew cask で配布されるため別途インストールする：
```bash
brew install --cask antigravity-cli   # コマンド: agy (antigravity のエイリアス)
agy                                    # 初回のみ対話起動して Google OAuth ログイン
```

MCP は使わない（旧 Gemini の Context7 は廃止）。リサーチは `agy -p "..."` の Web 検索で代替する。

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

### Windows Terminal: Shift+Enter → pi 改行

Mac Ghostty と同じ `Shift+Enter` で pi に改行を入れるため、Windows Terminal
の `settings.json` で `shift+enter` を `\u001b[13;2u` にリマップする。
詳細は `pi/README.md` の「Shift+Enter (WSL / Windows Terminal)」を参照。

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
