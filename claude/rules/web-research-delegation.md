# Web Research Delegation Rule

## 重要: WebSearch禁止

ClaudeのWebSearchツールは使用禁止。Web検索・調査は **firecrawl を基本**とし、**大きいタスクは Firecrawl + agy + Grok X Search で並行精査**する。
WebSearch は `claude/settings.json` の `permissions.deny` で機械的にもブロック済み（ルールと二重化）。

> Gemini CLI は 2026-06-18 に個人/無料枠のリクエスト処理を停止し Antigravity CLI (`agy`) に統合された。

## ツールの線引き

| 状況 | 使うもの |
|------|----------|
| WebSearch（検索クエリ） | **禁止** → firecrawl |
| 単一の既知URLを1回読むだけ | WebFetch 可（軽量・即時） |
| 検索・複数URL・SPA・scrape/crawl・構造化抽出 | firecrawl skill |
| 大きい／確証が要る調査（後述の昇格基準） | `/cross-research`（Firecrawl + agy + Grok X Search 並行精査） |

## cross-research への昇格基準

次の**どれか1つでも該当**したら firecrawl 単独で終えず `/cross-research` に上げる（二値判定）:

- [ ] コード/設計/依存選定に影響する
- [ ] 独立した情報源 2件以上の裏取りが要る
- [ ] 直近12ヶ月で変動する情報（version / 価格 / news）
- [ ] ソースの矛盾が予想される

例: 「Next.js vs Remix どちらにすべきか」「この依存の脆弱性は本当か」→ 昇格する。
「あるライブラリの最新版番号を1つ知りたいだけ」→ 昇格しない（firecrawl 単発でよい）。
迷ったら昇格する（安全側）。

## 基本方針

1. **デフォルト = firecrawl**
   - Web検索・URL本文取得・scrape/crawl/構造化抽出は firecrawl skill を使う（`/firecrawl` ほか firecrawl-* skill）
   - 実URLの一次ソースが取れる。WebSearch の代替はこれ（単一既知URLの即時取得だけは WebFetch 可）
2. **大きいタスク = 3レーン並行**
   - 昇格基準に当たる調査は `/cross-research` で **Firecrawl + agy + Grok X Search** を**並行実行して突き合わせ精査**
   - **Firecrawl** = canonical Web ドキュメント（主根拠）
   - **Grok X Search** = X 上の一次発表・公開議論（公式 X 投稿は発表の補助。一般反応はソーシャルシグナルのみ）
   - **agy** = 横断調査・推論・トレンド要約（確証単独不可。他レーンと突合）
3. **agy 単独**（任意）
   - 純粋に横断要約だけでよければ `/antigravity-research`（agy のみ、`agy -p "..."`）
   - ただし agy 単独はハルシネーションがそのまま出る。**結論に使う事実は確証扱いせず**、重要なら cross-research で裏取りする

## レーン別フォールバック

### firecrawl が制限中

firecrawl が使えない時（**クレジット枯渇 / レート制限(429) / API エラー / 未認証**）は **agy + Grok X Search** にフォールバックする。状態は `firecrawl --status` で確認（credits 表示）。

- `/cross-research` 中なら → Firecrawl レーンを省略し、報告に「canonical 一次ソース未裏取り（firecrawl 制限中）」を明記。**X は公式ドキュメントの代替にならない**
- クレジット回復（サイクル更新）を待つ選択もあるが、待つ場合はユーザーに確認する

### Grok X Search が失敗

- Firecrawl + agy で続行し、報告に「X シグナル欠落」を明記
- X 単独では canonical Web ドキュメントを置き換えられない

### agy が失敗

- Firecrawl + Grok X Search で続行し、報告に「agy 欠落（横断推論なし）」を明記

## firecrawl 主要コマンド

- `firecrawl search` 検索＋本文 / `firecrawl scrape` URL取得 / `firecrawl map` URL探索
- `firecrawl crawl` サイト網羅 / `firecrawl agent` 構造化抽出(JSON)
- 結果は `.firecrawl/` に保存（再取得回避）
- クレジット（実測・無料プラン ~1,000/サイクル）: プレーン検索=**2固定**、`--scrape` は **+1/件**（`--scrape --limit 3`≈5）。`firecrawl search-feedback <id>` で1credit返金

## Grok X Search

- ヘルパー: `~/.agents/skills/cross-research/scripts/grok-x-search.sh --query "..." --output .firecrawl/cross-research-grok-x.json`
- モデル: `research.xai` ロール（`pi/agent/model-roles.json`）
- コスト: **$5 / 1,000 X Search 呼び出し** + モデルトークン
- 認証: `XAI_API_KEY` 優先、なければ `pi auth print-bearer-token --provider xai`

## 委譲結果の保存

- 調査結果は `.claude/docs/research/` に保存

## MCP

agy は MCP 無しで運用する（旧 Gemini の Context7 は廃止）。
