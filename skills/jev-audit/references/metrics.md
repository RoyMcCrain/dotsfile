# jev-audit metrics (local)

- **不一致候補**: effective または suggested が監査人 `[minLevel,maxLevel]`
  の外側（too shallow / too deep は候補ラベルのみ）。
- **分母**: 同一層（random / risk）内で status=audited かつ監査 JSON
  成功のケースのみ。suggested 比較は `suggestedLevel` 欠如時 N/A。
- **attemptedCalls**: 当週の独立成功監査回数。cacheHits: 他週キャッシュ再利用。
- **costUsd**: 常に「未計測」（テキスト runner は課金を報告しない）。
