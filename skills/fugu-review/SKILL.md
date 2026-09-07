---
name: fugu-review
description: "DISABLED — Sakana Fugu subscription cancelled. Do not execute until user explicitly requests reactivation."
---

# /fugu-review — DISABLED

**Sakana Fugu は解約により無効。** この skill は実行しない。ユーザーが再契約後に明示的に再有効化を依頼するまで、`fugu-review` / `review.fugu` / Fugu モデルへのルーティングは禁止。別の有料モデルへの自動フォールバックもしない。

再有効化手順は [pi/README.md](../../pi/README.md) の Fugu セクションを参照。

<!--
Historical instructions (inactive — preserved for reactivation):

# /fugu-review

Fugu Ultra は quota / rate limit に当たりやすいため、自動選択しない。ユーザーが Fugu を明示した場合だけ実行する。

## 手順

1. 他の単体 review と同様に、秘密パターンを除外した `$REVIEW_DIR/changes.patch` と `$REVIEW_DIR/prompt.md` を呼び出し元が一度だけ作り、patch に秘密値がないか確認する。
2. 隔離 runner で実行する。

```bash
RUNNER="$HOME/.agents/skills/parallel-review/scripts/run_pi_review.sh"
TIMEOUT=$("$HOME/.pi/agent/resolve-model.sh" --field timeout review.fugu 2>/dev/null || echo 240)
"$RUNNER" \
  --role review.fugu \
  --prompt "$REVIEW_DIR/prompt.md" \
  --input "$REVIEW_DIR/changes.patch" \
  --cwd "$REVIEW_DIR" \
  --timeout "$TIMEOUT"
```

## 制約

- `--role` は `~/.pi/agent/model-roles.json` から実モデル ID を解決する。モデル変更はそのカタログだけを編集する。
- runner は一時設定で retry を止め、CLIで skill / context / extension / tools を無効化した patch-only で実行する。
- timeout、quota、rate limit、provider error 時は即座に短く報告する。
- 自動再試行・別モデルへの自動フォールバックは禁止。
- 出力は High / Medium / Low、Nit 省略、最大8件。各指摘に `file:line`、実害、根拠、最小修正案。
-->
