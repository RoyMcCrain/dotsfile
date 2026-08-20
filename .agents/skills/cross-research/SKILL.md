---
name: cross-research
description: |
  Firecrawl、agy、Grok X Search で Web 調査を並行実行し、突き合わせて精査する。次の二値基準のどれか1つでも該当する「大きい／確証が要る」Web 調査で使う: (1) コード/設計/依存選定に影響する、(2) 独立した情報源2件以上の裏取りが要る、(3) 直近12ヶ月で変動する情報（version/価格/news）、(4) ソースの矛盾が予想される。迷ったら昇格する。ルーチンな単発検索は firecrawl skill を直接使い、これは使わない。
allowed-tools:
  - Bash(agy *)
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
  - Bash(~/.agents/skills/cross-research/scripts/grok-x-search.sh *)
  - Bash(jq *)
---

# /cross-research

Firecrawl、Antigravity CLI (`agy`)、xAI Grok **X Search** を**並行**で走らせ、3方向の結果を突き合わせて精査する Web 調査スキル。
**大きい／裏取り必須のタスク向け**。ルーチンな Web 検索は `/firecrawl` を直接使い、横断要約だけなら `/antigravity-research`（agy 単独）でよい。

## コマンド

- `/cross-research [調査したいこと]`

## 実行手順

1. 調査クエリと観点を整理
2. 以下を**並行**で実行する（1メッセージ内で3つの Bash を同時に投げる）:
   - `firecrawl search "[クエリ]" --scrape --limit 3 -o .firecrawl/cross-research.json --json`（実Web検索＋本文取得。canonical ドキュメントの一次ソース。無料プラン節約のため既定 limit 3）
   - `agy --print-timeout 120s -p "次について調査して要点と出典を返して: [クエリ]"`（横断調査・推論・トレンド。単独では確証にしない）
   - `~/.agents/skills/cross-research/scripts/grok-x-search.sh --query "[クエリ]" --output .firecrawl/cross-research-grok-x.json`（X 上の一次発表と公開議論。生 JSON は `.firecrawl/` に保存）
3. firecrawl の結果は本文込みで保存されるので、`jq` で要点と出典URLを抽出する:
   - `jq -r '.data.web[] | "- \(.title): \(.url)"' .firecrawl/cross-research.json`
4. Grok の stdout は正規化済み要約（本文＋引用）。必要なら `.firecrawl/cross-research-grok-x.json` を `jq` で追加確認する
5. 3者を突き合わせて報告する:
   - **Firecrawl** の canonical 一次ソース（公式ドキュメント・製品ページ等）を最優先
   - **Grok X Search** の first-party X 投稿（公式アカウントの告知等）は発表・時系列の補助根拠になりうる
   - 一般ユーザーの X 反応は**ソーシャルシグナル**（世論・噂の温度）として扱い、事実の確証には使わない
   - **agy** は broad synthesis / trend reasoning。2ソース以上と一致した点のみ確度を上げる
   - 2レーン以上が一致する事実 → **確度が高い**
   - 1レーンのみの指摘 → 補足として、どの出典かを明記
   - 矛盾する場合 → 各ソースの見解と出典を併記し、Firecrawl の canonical 本文を優先候補にする
6. **昇格した調査の成果は既存の research docs ディレクトリに保存**（リポジトリ内の既存 research docs ディレクトリがあればそこを優先、なければ `docs/research/`。揮発防止）

## ソース階層（3-way synthesis）

| 優先度 | レーン | 役割 | 確証の扱い |
| ------ | ------ | ---- | ---------- |
| 1 | Firecrawl | canonical Web ドキュメント・一次ページ | 事実の主根拠 |
| 2 | Grok X Search | 公式 X 告知・公開議論 | 一次 X 投稿は発表の補助。一般反応はシグナルのみ |
| 3 | agy | 横断要約・推論・トレンド | 確証単独不可。他レーンと突合 |

## コスト・認証

- **Firecrawl**: クレジット消費（実測: プレーン検索=2credit固定、`--scrape` は +1/件 → `--scrape --limit 3`≈5credit）。無料プラン ~1,000/サイクル
- **Grok X Search**: **$5 / 1,000 X Search 呼び出し** + モデルトークン。モデル ID は `research.xai` ロール経由（`pi/agent/model-roles.json`）
- **agy**: Google OAuth（初回ログイン）

**Grok 認証フォールバック**（`grok-x-search.sh` 内）:

1. 環境変数 `XAI_API_KEY` が非空ならそれを使用
2. なければ `pi auth print-bearer-token --provider xai`（Pi OAuth、`api:access` スコープ）

## フォールバック（レーンが失敗した時）

- **agy 失敗**（未認証/タイムアウト等）→ Firecrawl + Grok で続行し、報告に「agy 欠落（横断推論なし）」を明記
- **Grok 失敗**（未認証/API エラー/レート制限等）→ Firecrawl + agy で続行し、報告に「X シグナル欠落」を明記。**X は canonical Web ドキュメントの代替にならない**
- **firecrawl 失敗/クレジット不足** → `.firecrawl/` のキャッシュを確認。無ければ agy + Grok で続行し「canonical 一次ソース未裏取り・要確認」と明記。**X 単独では公式ドキュメントを置き換えられない**
- 全レーン失敗 → ユーザーに状況を報告して指示を仰ぐ

## 棲み分け

- **canonical 一次ソース（公式ドキュメント・製品ページ）** → Firecrawl が得意
- **X 上の一次発表・公開議論** → Grok X Search が得意
- **横断的な理解・推論・最新トレンドの要約** → agy が得意
- agy は「もっともらしいが誤り」を出しうるので、Firecrawl の実本文と Grok の X 引用で事実確認するのがこのスキルの肝

## firecrawl 側の差し替え

- 既知サイトから**構造化データ(JSON)**を抜くなら `firecrawl agent "[プロンプト]"` に差し替える
- ドキュメント網羅が要るなら `firecrawl crawl`、URL探索なら `firecrawl map`
- 詳細は `/firecrawl`（firecrawl-cli skill）参照

## 注意

- firecrawl はクレジット消費。結果は `.firecrawl/` に保存して再取得を避ける
- コストが気になる時は `firecrawl search-feedback <id>` を1回送ると 1credit 返金
- agy 初回は Google OAuth ログインが必要
- 単に agy だけで十分なら `/antigravity-research` を使う
