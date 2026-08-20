# Preflight（read-only）

実装レポートもレビューレポートも、同じ secret-safe patch 収集を使う。policy の
正は `review-report` の `isSecretPath`。bash に再実装しない。

## 手順

1. **VCS**: リポジトリ root に `.jj` があれば git ではなく jj。
2. **秘密除外**: 次を patch / subagent / report に含めない。 `.env*`, `.envrc`,
   `credentials*`, `secrets*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`,
   `id_ed25519`
   - 先に **changed path 一覧だけ** 取得し、old/new のどちらかが secret
     なら除外する。
   - **unsanitized full patch を先に生成・保存して後から redact
     してはいけない**。
   - allowed paths だけを VCS diff に渡し、**sanitized patch を直接生成**する。
3. **plan**: 実装分析（Stage 0）には一切渡さない。
4. **Hunk（任意）**: live session があれば
   `hunk session comment list --repo . --type user` で人間コメントを import
   できる。必須ではない。コメントの old/new path にも `isSecretPath`
   を適用し、secret path に紐づくコメントは取得・保存・subagent 送信しない。
5. **ソース編集禁止**: tracked ファイルを変更しない。
6. **repository metadata**: Stage 0 完了後に main agent が収集する。Stage 0
   subagent には渡さない。

## スクリプト

```bash
skills/implementation-report/scripts/collect_sanitized_patch.sh \
  --repo ROOT --out DIR
```

出力:

- `DIR/sanitized.patch` — allowed paths だけの patch。空 diff は空ファイルで成功
- `DIR/allowed-paths.txt`
- `DIR/excluded-paths.txt`

生成後に private key marker があれば非 0 終了する。unsanitized full patch
は作らない・残さない。
