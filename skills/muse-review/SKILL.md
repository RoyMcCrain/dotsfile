---
name: muse-review
description: Pi headless（Muse Spark 1.3 Contributor）で120秒上限の単体コードレビューを実行する。ユーザーが Muse を明示し、学習利用への同意を得た場合のみ使う。
---

# /muse-review

Muse Spark 1.3 Contributor は **prompt / completion を学習に利用する** Contributor モデルであり、zero-data-retention ではない。`parallel-review` の全 tier にも Muse Contributor :high が含まれるが、**この skill は単体レビュー専用**（`/skill:muse-review` または Muse 明示時のみ）。parallel 経路は tier の固定 timeout 予算と `attempts=2`、単体は role `review.muse` の 120s と `attempts=1`。ユーザーが Muse 単体レビューを明示し、**提出対象パッチの学習利用を許可した場合のみ** 実行する。

## 事前確認（必須）

runner 実行前に必ず行う:

1. Muse Contributor が prompts/completions を学習に利用すること、zero-data-retention ではないことを説明する。
2. 対象パッチ（秘密除外済み `$REVIEW_DIR/changes.patch`）を学習利用して外部送信してよいか、ユーザーに確認する。Muse 指定・公開 remote・秘密検査だけでは同意とみなさない。ユーザーが対象を public / 非機密と明示し、学習利用を伴う送信も許可済みなら再確認は不要。
3. 認証情報・顧客データ・雇用先機密コードが含まれる可能性がある場合は送信せず、許可を得るまで停止する。許可が得られない場合、別 provider へ silently fallback しない。

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
