---
name: cross-research
description: |
  agy と firecrawl で Web 調査を並行実行し、突き合わせて精査する。次の二値基準のどれか1つでも該当する「大きい／確証が要る」Web 調査で使う: (1) コード/設計/依存選定に影響する、(2) 独立した情報源2件以上の裏取りが要る、(3) 直近12ヶ月で変動する情報（version/価格/news）、(4) ソースの矛盾が予想される。迷ったら昇格する。ルーチンな単発検索は firecrawl skill を直接使い、これは使わない。
allowed-tools:
  - Bash(agy *)
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
  - Bash(jq *)
metadata:
  target_agent: claude
---

# /cross-research

Antigravity CLI (`agy`) と Firecrawl を**並行**で走らせ、両者の結果を突き合わせて精査する Web 調査スキル。
**大きい／裏取り必須のタスク向け**。ルーチンな Web 検索は `/firecrawl` を直接使い、横断要約だけなら `/antigravity-research`（agy 単独）でよい。

## コマンド

- `/cross-research [調査したいこと]`

## 実行手順

1. 調査クエリと観点を整理
2. 以下を**並行**で実行する（1メッセージ内で2つの Bash を同時に投げる）:
   - `agy --print-timeout 120s -p "次について調査して要点と出典を返して: [クエリ]"`（横断調査・推論）
   - `firecrawl search "[クエリ]" --scrape --limit 3 -o .firecrawl/cross-research.json --json`（実Web検索＋本文取得。無料プラン節約のため既定 limit 3）
3. firecrawl の結果は本文込みで保存されるので、`jq` で要点と出典URLを抽出する:
   - `jq -r '.data.web[] | "- \(.title): \(.url)"' .firecrawl/cross-research.json`
4. 両者を突き合わせて報告する:
   - 両方が一致する事実 → **確度が高い**
   - 片方のみの指摘 → 補足として、どちらの出典かを明記
   - 矛盾する場合 → 両方の見解と出典を併記し、firecrawl の一次ソース（実URL本文）を優先候補にする
5. **昇格した調査の成果は必ず `.claude/docs/research/` に保存**（揮発防止）

## フォールバック（片方が失敗した時）

- **agy 失敗**（未認証/タイムアウト等）→ firecrawl 単独で続行し、報告に「agy 欠落（横断推論なし）」を明記
- **firecrawl 失敗/クレジット不足** → `.firecrawl/` のキャッシュを確認。無ければ agy 単独で続行し「一次ソース未裏取り・要確認」と明記
- 両方失敗 → ユーザーに状況を報告して指示を仰ぐ

## 棲み分け

- **横断的な理解・推論・最新トレンドの要約** → agy が得意
- **一次ソースの実取得（実URL本文・検索ヒット）** → firecrawl が得意。出典の裏取りに使う
- agy は「もっともらしいが誤り」を出しうるので、firecrawl の実本文で事実確認するのがこのスキルの肝

## firecrawl 側の差し替え

- 既知サイトから**構造化データ(JSON)**を抜くなら `firecrawl agent "[プロンプト]"` に差し替える
- ドキュメント網羅が要るなら `firecrawl crawl`、URL探索なら `firecrawl map`
- 詳細は `/firecrawl`（firecrawl-cli skill）参照

## 注意

- firecrawl はクレジット消費（実測: プレーン検索=2credit固定、`--scrape` は +1/件 → `--scrape --limit 3`≈5credit）。無料プランは ~1,000/サイクル。結果は `.firecrawl/` に保存して再取得を避ける
- コストが気になる時は `firecrawl search-feedback <id>` を1回送ると 1credit 返金
- agy 初回は Google OAuth ログインが必要
- 単に agy だけで十分なら `/antigravity-research` を使う
