---
name: claude-review
description: Pi headless（Anthropic Claude Opus）で120秒上限の単体コードレビューを実行する。「レビューして」だけなら parallel-review を優先する。
metadata:
  target_agent: claude
---

# /claude-review

Claude を、再帰起動しない隔離済み Pi headless で実行する。

## 手順

1. 対象を決める。指定なしなら現在の作業コピー差分。
2. 呼び出し元が changed paths を先に取得し、秘密パターン（`.env*`, `.envrc`, `credentials*`, `secrets*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519` 等）を除外する。
3. allowed paths だけから `$REVIEW_DIR/changes.patch` を一度生成し、秘密値・private key marker がないか目視/検索する。子 Pi に `jj diff` / `git diff` を再実行させない。
4. `parallel-review` と同じ patch-only prompt（Preflight 手順4）を `$REVIEW_DIR/prompt.md` に保存して runner を実行する。

```bash
RUNNER="$HOME/.agents/skills/parallel-review/scripts/run_pi_review.sh"
"$RUNNER" \
  --role review.claude \
  --prompt "$REVIEW_DIR/prompt.md" \
  --input "$REVIEW_DIR/changes.patch" \
  --cwd "$REVIEW_DIR" \
  --timeout 120
```

`--role` は `~/.pi/agent/model-roles.json` から実モデル ID を解決する。モデル変更はそのカタログだけを編集する。

runner は一時設定で retry を止め、CLIで skill / context / extension / tools を無効化した patch-only で実行する。タイムアウト時は exit 124。自動再試行・自動フォールバックはしない。

## 出力

- High / Medium / Low の重大度順。Nit は省略。
- 最大8件。
- 各指摘に `file:line`、問題、実害、根拠、最小修正案。
- 指摘なしなら「重大な問題なし」。
- 呼び出し元が根拠を確認してから報告する。
