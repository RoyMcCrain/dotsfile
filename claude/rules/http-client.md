# HTTP Client Rule

## curlではなくaxを使う

Bashツールで単発のHTTPリクエスト・API疎通確認・デバッグ用フェッチを行う際は `curl` ではなく `ax` を使う。
`ax`（https://github.com/yusukebe/ax）はコーディングエージェント向けに設計されたcurl代替で、"The AI-era curl: fetch, discover, extract" として、レスポンス本文だけでなく構造（ステータス・ヘッダー・リンク等）の理解を常に返す。
devbox global でインストール済み（`devbox/devbox.json` の `github:yusukebe/ax`）。

```bash
ax <url>              # curl <url> の代わり
ax --help              # オプション確認（POST・認証ヘッダー等）
```

## 例外（curlのままでよいケース）

- インストールスクリプトのcurlパイプ（例: `curl -fsSL https://.../install | sh`）はツール配布の慣習であり対象外
- 単一の既知URLの本文取得・要約が目的ならWebFetchを優先する（[[web-research-delegation]]参照）。axはAPI疎通・ヘッダー確認・構造抽出などターミナル上のデバッグ用途で使う
