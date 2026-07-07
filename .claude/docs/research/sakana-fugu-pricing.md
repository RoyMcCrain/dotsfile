# Sakana AI Console (Fugu / Fugu Ultra) 課金体系調査

調査日: 2026-07-07
方式: cross-research (firecrawl 実本文 + agy 横断調査、突き合わせ済み)

## 料金プラン

### 月額サブスクリプション
すべてのティアで `fugu` と `fugu-ultra` の両方が使える。差は利用枠の大きさのみ。

| Plan     | 価格      | 利用枠           |
| -------- | --------- | ---------------- |
| Standard | $20/month | ベースライン枠   |
| Pro      | $100/month| Standardの10倍   |
| Max      | $200/month| Standardの30倍   |

出典: https://console.sakana.ai/pricing （一次ソース）

※ dev.classmethod.jp の実測記事本文には「Max = Standardの20倍」という記述があるが、
公式料金ページは30倍と明記。公式ページを優先する。

### 従量課金 (Pay-as-you-go)
サブスクの利用枠とは別に存在し、**サブスクの月額トークンより高優先度**で処理される。

`fugu-ultra-20260615` の料金（1Mトークンあたり）:

| Token type     | Standard | Context > 272K |
| -------------- | -------- | --------------- |
| Input          | $5       | $10             |
| Output         | $30      | $45             |
| Cached input   | $0.50    | $1.00           |

`fugu` は個別従量課金がなく、「複数エージェントを呼んでも積み上げ課金しない・
関わった最上位モデルの単価のみ請求」という設計。

完全無料のフリーティアは確認できず。

## クォータ・レート制限

- **5時間ウィンドウ** と **週間(7日)ウィンドウ** の2段構えのローリングクォータ
  （Claude Codeの5時間枠+週次枠と同じ設計思想）
- `fugu` と `fugu-ultra` は**同一プラン内でクォータを共有**
- `fugu-ultra` は裏側でマルチエージェント（GPT 5.5 / Claude Opus 4.8 / Gemini 3.1 Pro等）を
  orchestration するため、同じ作業でも `fugu` よりクォータ消費速度が桁違いに速い
- 実測値（dev.classmethod.jp, Standardプラン）: 軽いコード生成1回
  （total 28,950 tokens, うち orchestration 26,404 tokens）だけで**5時間枠の10%超**を消費
- 超過時: `429 Too Many Requests`。指数バックオフでのリトライ推奨
- リセット: 各ウィンドウ（5時間 / 週間）の経過に応じて順次回復

## 実際の運用への含意（このrepo向け）

- `models.json` の `cost.cacheRead: 0` はローカル表示上の値であり、Sakana側の実クォータ消費とは無関係。
  キャッシュ入力トークンも実際にはウィンドウ消費・課金対象。
- orchestration系トークン（`orchestration_input_tokens`等）も「表面の入出力と同じ単価で課金される」と
  公式ドキュメントに明記あり。オーケストレーション比率が高い `fugu-ultra` は見た目以上にクォータを食う。
- `contextWindow` を大きくする（例: 1,000,000）と compaction が遅れ、1リクエストあたりの
  送信量（≒キャッシュ対象トークン量）が肥大化し、5時間ウィンドウを短時間で使い切りやすくなる。
  → `pi/agent/models.json` の `fugu-ultra.contextWindow` は 200000 程度に抑えるのが無難。

## 出典

- https://console.sakana.ai/pricing （一次ソース、料金表）
- https://dev.classmethod.jp/en/articles/sakana-fugu-ga-first-touch/ （実測レポート、二次情報）
- https://openrouter.ai/sakana/fugu-ultra （モデル概要）
- agy (Antigravity CLI) 横断調査（上記と主要数値が一致、429/リセット周期/クォータ共有の記述を裏付け）
