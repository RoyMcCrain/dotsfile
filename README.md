# dotsfile

いろいろ設定集

初回セットアップは [SETUP.md](SETUP.md) を参照。

## devbox

https://www.jetify.com/devbox/docs/installing_devbox/

### 設定ファイルの場所

devbox globalの設定は以下のsymlinkで管理：
```
~/.local/share/devbox/global/default/devbox.json → dotsfile/devbox/devbox.json
```

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

### pnpm / LSP

`devbox/devbox.json`で管理：
- pnpm: nixpkgsパッケージ
- LSP: nixpkgsパッケージ

## AI Tools

Claude Code, Codex CLI, Gemini CLIの設定を管理。

```
claude/   → ~/.claude/    # rules, skills, hooks
codex/    → ~/.codex/     # AGENTS.md, instructions.md
gemini/   → ~/.gemini/    # GEMINI.md, instructions.md
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
- `fish/config.fish` がソケット存在時のみ `SSH_AUTH_SOCK` をそこへ向ける
- 鍵の追加は SSH キー型アイテムとして登録（既存鍵はファイルからインポート、または新規生成）
- git/ssh 利用には **アプリ起動 + vault アンロック** が必要

新規鍵を GitHub に登録する例:

```fish
ssh-add -L > /tmp/key.pub          # agent が供給する公開鍵を取得
gh ssh-key add /tmp/key.pub --title "Bitwarden (MBP)"
ssh -T git@github.com              # 疎通確認（アプリの承認ダイアログを承認）
```
