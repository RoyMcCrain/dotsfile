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
