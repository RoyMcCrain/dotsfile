---
name: muse-review
description: Pi headless（Muse Spark 1.3）で120秒上限の単体コードレビューを実行する。ユーザーが Muse を明示した場合に使う。
---

# /muse-review

`parallel-review` は L1–L3 に Muse Spark 1.3 :high、L4/L5 に Muse Wonder 1.0 :high を含むが、**この skill は単体レビュー専用**（`/skill:muse-review` または Muse 明示時のみ）。parallel 経路は tier の固定 timeout 予算と `attempts=2`、単体は role `review.muse` の 120s と `attempts=1`。ユーザーが Muse 単体レビューを明示した場合に実行する（Muse 選択は必須）。

## 事前確認

runner 実行前に必ず行う:

1. **Muse 単体選択**: ユーザーが `/skill:muse-review` または Muse 単体 reviewer を明示していること（`parallel-review` 経由の「レビューして」だけではこの skill を起動しない）。
2. **安全例外**: 認証情報・顧客データ・雇用先機密コードが含まれる可能性がある場合は送信せず、許可を得るまで停止する。ユーザーが Muse 送信を撤回・制限・拒否した場合も停止し、別 provider へ silently fallback しない。

## 手順

1. 他の単体 review と同様に、秘密パターンを除外した `$REVIEW_DIR/changes.patch` と `$REVIEW_DIR/prompt.md` を呼び出し元が一度だけ作り、patch に秘密値がないか確認する。
2. 隔離 runner で実行する。

```bash
RUNNER="$HOME/.agents/skills/parallel-review/scripts/run_pi_review.sh"
TIMEOUT=$("$HOME/.pi/agent/resolve-model.sh" --field timeout review.muse 2>/dev/null || echo 120)
"$RUNNER" \
  --role review.muse \
  --prompt "$REVIEW_DIR/prompt.md" \
  --input "$REVIEW_DIR/changes.patch" \
  --cwd "$REVIEW_DIR" \
  --timeout "$TIMEOUT" \
  --attempts 1
```

## 制約

- `--role` は `~/.pi/agent/model-roles.json` から実モデル ID を解決する。モデル変更はそのカタログだけを編集する。
- runner は一時設定で retry を止め、CLIで skill / context / extension / tools を無効化した patch-only で実行する。
- timeout、provider error 時は即座に短く報告する。
- 自動再試行・別モデルへの自動フォールバックは禁止。
- 出力は High / Medium / Low、Nit 省略、最大8件。各指摘に `file:line`、実害、根拠、最小修正案。呼び出し元が根拠を確認してから報告する。
