# dotsfile

いろいろ設定集

初回セットアップは [SETUP.md](SETUP.md) を参照。

## devbox

https://www.jetify.com/devbox/docs/installing_devbox/

### 設定ファイルの場所

devbox globalの設定は以下のように管理：
```
~/.local/share/devbox/global/default/devbox.json → dotsfile/devbox/devbox.json (symlink)
~/.local/share/devbox/global/default/runtime-packages/ (実ディレクトリ。flake.nix と flake.lock のコピー)
```
Nix の pure evaluation がこの構成での symlink 経由の flake 参照を拒否するため、`runtime-packages` は symlink ではなく実体のコピーにする。

### パッケージ管理

パッケージ追加：
```bash
devbox global add <package>
```

パッケージ削除：
```bash
devbox global rm <package>
```

インストール済みパッケージ一覧：
```bash
devbox global list
```

環境の更新（パッケージ追加後）：
```bash
refresh-global  # devboxが自動定義するalias
```

### Runtime versions

Node.js 26 は Devbox のパッケージカタログから解決する。Deno 2.9.8、Bun 1.4.4、Eclipse Temurin JDK 21 (21.0.13+9) は、カタログに固定バージョンがないため、`devbox/runtime-packages` の flake で公式バイナリのバージョンと SHA-256 を固定している。

pin を更新するときは `devbox/runtime-packages/flake.nix` と必要に応じて `flake.lock` を編集し、次のコマンドで global 側の実体コピーを同期してからインストールする（セットアップスクリプト全体の再実行は不要）：

```bash
cp devbox/runtime-packages/flake.nix devbox/runtime-packages/flake.lock ~/.local/share/devbox/global/default/runtime-packages/
devbox global install
```

対象パッケージがカタログで利用可能になったら、`devbox/devbox.json` の `path:` エントリを通常のカタログパッケージに戻し、このローカル flake コピーの設定と説明を削除する。

### pnpm / LSP

`devbox/devbox.json`で管理：
- pnpm: nixpkgsパッケージ
- LSP: nixpkgsパッケージ

## AI Tools

Claude Code, Codex CLI, Antigravity CLI (agy) の設定を管理。

```
claude/        → ~/.claude/                  # rules, skills, hooks
codex/         → ~/.codex/                   # AGENTS.md, instructions.md
antigravity/   → ~/.gemini/antigravity-cli/  # AGENTS.md, instructions.md (旧 Gemini CLI)
```

## Bitwarden

パスワード/シークレット管理。CLI (`bw`) は `devbox/devbox.json` で管理。

### vault のアンロック

`bw-unlock` (fish function) でアンロックし、`BW_SESSION` をシェルに設定する。

```fish
bw-unlock              # マスターパスワード入力 → BW_SESSION を export
bw list items --search github
bw lock                # ロック
```

### SSH 鍵管理（Desktop SSH Agent）

SSH 秘密鍵はディスクに置かず、Bitwarden Desktop アプリの内蔵 SSH Agent で管理する。

- アプリの設定で「SSH エージェント」を有効化するとソケットが生成される
  ```
  ~/Library/Containers/com.bitwarden.desktop/Data/.bitwarden-ssh-agent.sock
  ```
- `ssh/config`（`~/.ssh/config` に symlink）の `IdentityAgent` でこのソケットを常用する。接続時に解決されるため、シェルや Bitwarden の起動順に依存しない
- 鍵の追加は SSH キー型アイテムとして登録（既存鍵はファイルからインポート、または新規生成）
- git/ssh 利用には **アプリ起動 + vault アンロック** が必要

新規鍵を GitHub に登録する例:

```fish
ssh-add -L > /tmp/key.pub          # agent が供給する公開鍵を取得
gh ssh-key add /tmp/key.pub --title "Bitwarden (MBP)"
ssh -T git@github.com              # 疎通確認（アプリの承認ダイアログを承認）
```
