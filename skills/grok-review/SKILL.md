---
name: grok-review
description: Pi headless（xAI Grok 4.6）で120秒上限の単体コードレビューを実行する。明示的な単体 Grok レビュー依頼時だけ使う。
---

# /grok-review

xAI Grok 4.6 を、再帰起動しない隔離済み Pi headless で実行する。`parallel-review` でも Grok は全レベルに含まれるが、Grok 単体を明示指定された場合はこの skill を使う。

## 手順

1. 他の単体 review と同様に、秘密パターンを除外した `$REVIEW_DIR/changes.patch` と `$REVIEW_DIR/prompt.md` を呼び出し元が一度だけ作り、patch に秘密値がないか確認する。
2. 隔離 runner で実行する。

```bash
RUNNER="$HOME/.agents/skills/parallel-review/scripts/run_pi_review.sh"
TIMEOUT=$("$HOME/.pi/agent/resolve-model.sh" --field timeout review.grok 2>/dev/null || echo 120)
"$RUNNER" \
  --role review.grok \
  --prompt "$REVIEW_DIR/prompt.md" \
  --input "$REVIEW_DIR/changes.patch" \
  --cwd "$REVIEW_DIR" \
  --timeout "$TIMEOUT"
```

## 制約

- `--role` は `~/.pi/agent/model-roles.json` から実モデル ID を解決する。モデル変更はそのカタログだけを編集する。
- runner は一時設定で retry を止め、CLIで skill / context / extension / tools を無効化した patch-only で実行する。
- timeout、provider error 時は即座に短く報告する。
- 自動再試行・別モデルへの自動フォールバックは禁止。
- 出力は High / Medium / Low、Nit 省略、最大8件。各指摘に `file:line`、実害、根拠、最小修正案。呼び出し元が根拠を確認してから報告する。
