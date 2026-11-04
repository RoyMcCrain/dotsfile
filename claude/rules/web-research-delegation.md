# Web Research Delegation Rule

## 重要: WebSearch禁止

ClaudeのWebSearchツールは使用禁止。cross-research の昇格基準を必ず先に判定し、大きいタスクは **Grok Web Search + Firecrawl + agy** で並行精査する。通常のWeb検索・発見・初期要約は Grok の `web_search` を使い、Firecrawl は公式ページ・本文の裏取りや不足補完に使う。既知の公開公式 raw-Markdown URLを単純に1回取得する場合だけ ax を優先する。
WebSearch は `claude/settings.json` の `permissions.deny` で機械的にもブロック済み（ルールと二重化）。

> Gemini CLI は 2026-06-18 に個人/無料枠のリクエスト処理を停止し Antigravity CLI (`agy`) に統合された。

## ツールの線引き

| 状況 | 使うもの |
|------|----------|
| WebSearch（検索クエリ） | **禁止** → grok-search skill |
| 既知の公開公式 raw-Markdown URLを1回取得 | ax HTTP/body（失敗・非Markdownなら公式ページをFirecrawl） |
| その他の単一既知URLを1回読むだけ | WebFetch 可（軽量・即時） |
| 通常の検索・発見・初期要約 | `/grok-search`（Grok `web_search`） |
| 公式ページ本文確認、JS/SPA、複数ページ、map/crawl、構造化抽出、明示依頼 | Firecrawl skill |
| 大きい／確証が要る調査（後述の昇格基準） | `/cross-research`（Grok Web Search + Firecrawl + agy の3レーン並行） |

## cross-research への昇格基準

次の**どれか1つでも該当**したら単独検索で終えず `/cross-research` に上げる（二値判定）:

- [ ] コード/設計/依存選定に影響する
- [ ] 独立した情報源 2件以上の裏取りが要る
- [ ] 直近12ヶ月で変動する情報（version / 価格 / news）
- [ ] ソースの矛盾が予想される

例: 「Next.js vs Remix どちらにすべきか」「この依存の脆弱性は本当か」→ 昇格する。
「確定した版の公開公式Markdownを既知URLから1回取得するだけ」→ 昇格基準に当たらなければ ax。最新版・料金など変動する情報の判断は昇格する。
迷ったら昇格する（安全側）。

## 基本方針

1. **デフォルト = Grok Web Search（昇格基準の判定後）**
   - `/grok-search` を使う。出力は毎回新しい `.firecrawl/` 配下の結果ディレクトリに保存し、クエリ・引用URL・実際の取得時刻を対応付ける。実際の `web_search` で公式ソース優先、URL付きの事実と推論を分けて初期調査する。
   - Grokの未引用要約を確証扱いせず、出典と実際の本文を確認する。必要な公式ページや重要な事実は Firecrawl で補足・検証する。通常の質問ごとに重複したFirecrawl検索はしない。
   - 既知の公開公式 raw-Markdown の単純な1回取得だけ ax HTTP/body を優先し、実際のHTTP成功・最終URL・本文を確認する。失敗・不完全・HTML/ログイン/エラー本文なら反復せず対応する公式HTMLまたは公式サイト検索を Firecrawl で取得する。
   - キャッシュの出典・版・鮮度が十分なら再利用し、実際の取得／確認日を保つ。
2. **大きいタスク = 3レーン並行（ax例外より優先）**
   - `/cross-research` で **Grok Web Search（発見・統合の主導）+ targeted Firecrawl（公式ソース/本文の確認）+ agy（補助推論）** を並行実行する。
   - 並行作業は独立する範囲で維持する。同じURLを複数レーンが取得したことやモデル間の合意を独立した裏取りとして数えない。
   - 情報源の権威は取得プロバイダーではなく、実際の公式ソースと本文で判断する。Xの噂や引用のない合成を事実扱いしない。
3. **agy 単独**（任意）
   - 純粋に横断要約だけでよければ `/antigravity-research`（agy のみ、`agy -p "..."`）
   - ただし agy 単独はハルシネーションがそのまま出る。**結論に使う事実は確証扱いせず**、重要なら cross-research で裏取りする。

## レーン別フォールバック

### Grok Web Search が失敗

- 適切なら Firecrawl で検索・確認にフォールバックし、Grok失敗とフォールバックを報告する。
- cross-research では Firecrawl + agy を続行し、「Grok Web Search 欠落」を明記する。

### Firecrawl が制限中

- `firecrawl --status` で状態を確認し、`.firecrawl/` の出典・版・鮮度が十分なキャッシュを再利用する。なければ Grok + agy で続行し、「公式一次ソース本文未裏取り（Firecrawl制限中）」を明記する。
- 同一の出典URLや合意を独立証拠と扱わない。必要なら取得可能になるまで保留し、ユーザーに確認する。

### agy が失敗

- Grok Web Search + Firecrawl で続行し、報告に「agy 欠落（横断推論なし）」を明記する。

## Firecrawl 主要コマンド

- `firecrawl scrape` URL本文取得 / `firecrawl map` URL探索 / `firecrawl crawl` サイト網羅 / `firecrawl agent` 構造化抽出(JSON)
- 必要に応じ `firecrawl search` で補助検索（Grok失敗時または明示依頼など）
- 結果は `.firecrawl/` に保存（再取得回避）。従量課金・トークン費用に留意。

## Grok Web Search

- 詳細な実行例、出力の一意割り当て、クエリと実取得時刻の記録は `/grok-search` を参照。
- 明示的なX調査のみ `--mode x` を使い、一般Web検索には使わない。
- モデル: `research.xai` ロール（`pi/agent/model-roles.json`）。認証は `XAI_API_KEY` 優先、なければ `pi auth print-bearer-token --provider xai`。

## 委譲結果の保存

- 調査結果は `.claude/docs/research/` に保存

## MCP

agy は MCP 無しで運用する（旧 Gemini の Context7 は廃止）。
