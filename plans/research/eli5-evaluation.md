# ELI5 skill の導入評価

- 調査日: 2026-10-15
- 対象: [DreambigOu/ELI5](https://github.com/DreambigOu/ELI5)
- 確認 revision: `a766623b062331fdde53467001379b4ddf3acc2f`
- 作業 workspace: `eli5-research` / bookmark: `research/eli5`
- 状態: 調査のみ。skill のインストール、グローバル設定変更、upstream
  のスクリプト実行は行っていない。

## 結論

**説明相手を頻繁に切り替える用途には有用。ただし upstream
をそのまま導入するより、安全性と日本語運用に合わせて小さく調整した共有 skill
として採用するのがよい。**

- 価値は「年齢・職種・前提知識に合わせた説明方針」を再利用できること。新しい解析エンジンや追加モデルではない。
- 非エンジニアへの仕様説明、マネージャーへの障害・技術負債の説明、学習用の段階的な解説には適する。
- 自分が技術説明を読むだけなら、既存 agent
  への具体的な依頼で大部分を代替でき、導入優先度は低い。
- 正確性より伝わりやすさを優先する文言と、対象未指定時に5歳向けへ落とす挙動は、この環境にそのまま持ち込みたくない。
- HTML 図解、画像生成、専用コード解析、事実確認、レビュー機能は含まれない。

## 1. 実体と通常のプロンプトとの差

実際に利用する部分は `skills/eli5/SKILL.md` だけ。116行、7,965 bytes の Markdown
で、独自の実行コード・API キー・MCP server・常駐プロセスはない。

処理方針は次の3段階。

1. 説明対象の読者を特定する。年齢、教育段階、職種、家族・友人などに分類する。
2. 元資料を読む。コードなら関連ファイルを読み、エラーなら原因を理解するよう
   agent に求める。
3. 「一文の概要 → 比喩 → 必要な詳細 → その相手にとっての意味」の順で説明する。

| 読者                      | 主な調整                                 |
| ------------------------- | ---------------------------------------- |
| 子ども・初学者            | 短い文、身近な例、専門語の回避・定義     |
| Engineer・大学院生        | 正式用語、設計判断、trade-off、edge case |
| Manager・Director         | 影響、費用、リスク、判断事項             |
| Designer・Product Manager | UX、ユーザー価値、優先順位、scope        |

「日本語で、非エンジニアの上司向けに、影響・選択肢・判断事項の順で説明して」と具体的に依頼する場合との差は小さい。毎回その条件を書く負担を減らし、説明スタイルを揃える点が主な利点。

参照:
[SKILL.md](https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/skills/eli5/SKILL.md)

## 2. この環境との適合性

- upstream の公式導入手順は Claude Code の `~/.claude/skills/eli5` への配置。
- 内容は通常の `name` / `description` frontmatter と説明文だけで、特定 provider
  の API や Claude 専用 tool 名には依存しない。既存の共有 skills
  方式に載せる候補としては扱いやすい。ただし Pi / Codex での実動作は今回未検証。
- この repo の canonical 配置は
  `skills/<name>/`。`scripts/build_env/list_shared_agent_skills.sh` はその直下の
  skills を列挙し、セットアップ側が `~/.agents/skills/` に公開する。
- macOS / fish / jj のための runtime 追加や devbox package 追加は不要。jj
  コマンドを実行する機能もない。
- `implementation-report` / `review-report`
  は実装・差分の検証レポート、`cmux-markdown` は表示用。ELI5
  の「読者に合わせた解説」とは目的が異なるが、出力を HTML
  化・表示する機能を置き換えはしない。
- instructions は英語で、README
  では非英語対応が改善候補。日本語で使えないわけではないが、日本語の自然さ・文化に合う比喩・専門用語の保持は評価されていない。
- skill 本文を読む分の追加 context は必要。トークン削減ツールではない。

## 3. そのまま採用したくない指示

### 正確性を犠牲にする単純化

`SKILL.md:115` に次の記述がある。

> Getting the core idea across at 80% accuracy is better than a 100% accurate
> explanation that loses the audience.

これは技術説明、障害説明、認証・データ損失・金銭の判断では採用したくない。詳細を省略することと、事実を不正確にすることは区別すべき。

採用時は「事実関係は維持し、単純化した範囲と比喩の限界を短く示す。不明な原因・数値・工数を補わない」に置き換える。

### 読者未指定時の5歳向け固定

`SKILL.md:50` は読者未指定時に `Age 5` を既定にする。description
には広い説明要求も trigger
に含まれるため、通常の技術相談まで幼児向けに寄せる可能性がある。

採用時は明示的な
ELI5・読者指定に限定し、一般的な「説明して」を広く奪わない。読者未指定なら会話の前提知識を尊重する。

### 属性だけでの前提知識の推定

年齢や家族関係に固定の比喩・知識水準を割り当てる。便利な初期例ではあるが、実際の知識と一致するとは限らない。本人が示した前提知識・目的・希望する詳しさを優先する。

この repo の方針に合わせ、日本語で説明しても API
名、設定キー、コード、エラーメッセージなどの技術的識別子は原文を保持する。

## 4. 品質評価の読み方

作者の評価は3題、各4基準、計12判定。題材は DB index、manager 向けの web
application 構成説明、5th grader 向けの Git merge conflicts。

- README の現行結果: skill あり `10/12 = 83.3%`、なし `5/12 ≈ 41.7%`。upstream
  は後者を `41.6%` と表記。
- `eval-results.md` の初期結果: `91.7%` 対 `33.3%`。
- 作者ブログは差を初期の手動採点と後続の LLM
  自動採点の違いとして説明し、採点の非決定性も認めている。

この数値は、決めたスタイル基準に合った割合であって、事実正確性・理解度・日本語品質の改善率ではない。少数の作者評価なので、一般的なモデル全般に対する性能保証や独立検証として扱わない。

また、現行 runner の `run_claude()` は `claude -p ... --output-format text`
を呼ぶだけで、既存 skills・ユーザー設定・project context
を明示的に無効化しない。installed skill と baseline
の分離を厳密に保証する設計ではなく、クリーンな A/B
評価にはその条件を別途管理する必要がある。

参照:

- [README](https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/README.md)
- [eval-results.md](https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/eli5-workspace/eval-results.md)
- [evals.json](https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/eli5-workspace/evals.json)
- [run-evals.py](https://github.com/DreambigOu/ELI5/blob/a766623b062331fdde53467001379b4ddf3acc2f/eli5-workspace/run-evals.py#L59-L66)
- [作者による制作・評価の説明](https://andrewou.pages.dev/posts/building-an-eli5-skill-for-claude/)

## 5. 安全性・コスト・成熟度

### skill 本体

確認 revision
の本文に独自の外部通信先、telemetry、シェル実行、追加認証の要求は見当たらない。追加の実行コードがないので導入負担は小さい。

ただし「通信しないローカル説明器」ではない。コードや文書を読むよう host agent
に指示するため、それらは利用中のモデル/provider に通常の会話 context
として渡り得る。秘密情報の扱いと agent の権限は既存の制御を維持する。

### 評価用 Python は別物

`eli5-workspace/run-evals.py` は評価専用。標準で回答生成6回と採点6回の Claude
CLI 呼び出しを行い、ローカルに出力を保存する。Python と Claude
CLI、既存認証、推論コストを伴う。実行時の既存 context や権限も考慮が必要。

通常利用のために取り込む必要はなく、今回も実行していない。

### 開発状況

GitHub API の取得時点では stars 1,743、forks 102。コミットは10件で、最終 push は
2026-03-18。公開 release はない。小さな instructions-only skill
なので、更新が少ないことだけでは問題と判断しない。一方、stars
を品質や安全性の保証にはしない。

MIT License。`LICENSE` の copyright notice は `Copyright (c) 2026` と holder
名が欠けており、[issue #1](https://github.com/DreambigOu/ELI5/issues/1)
が未解決。取り込むなら原文 LICENSE と出典・固定 revision
を保持し、著作権者名を推測で補わない。

## 6. 採用する場合の最小スコープ

1. `SKILL.md` と原文 LICENSE・出典・固定 revision だけを取り込む。評価
   runner、devbox 依存、常駐処理は追加しない。
2. 正確性を犠牲にする文言を除去し、読者未指定時の扱いを修正する。
3. 日本語説明、技術的識別子の保持、実際の前提知識を優先する方針を加える。
4. 明示的な呼び出し・読者指定を中心に使い、通常のコード調査やレビューを横取りしない。
5. 公開題材の日本語説明を、非エンジニア向けと Engineer
   向けで少数比較する。事実関係・適切な詳しさ・比喩の限界・自然な日本語を確認し、改善が小さければ導入しない。

採用作業は未実施。新規 tool として大きく統合するより、小さいオンデマンドの説明
skill に留める。

## 7. 調査経路と限界

- Firecrawl: 公式 GitHub、作者ブログ、TypingMind / SkillsLLM の掲載情報を取得。
- GitHub API: 固定 revision の skill・評価コード・LICENSE、履歴、issues、release
  情報を確認。
- Grok X Search:
  関連する紹介投稿はあるが、作者の一次告知や独立した比較評価の十分な証拠は得られなかった。X
  の反応は性能・安全性の根拠に使っていない。Anthropic の別の ELI5
  デモと、この非公式 repo を混同しない。
- Antigravity: headless 実行が `command` permission の auto-deny
  により有効な結果を返さなかった。権限を緩和せず、Firecrawl・実ソース・Grok
  の2レーンと直接確認で継続。Antigravity の横断調査結果は欠落。
- 英語・日本語いずれも実際の説明生成の A/B 実験は今回未実施。評価 runner
  の実行、インストール、設定変更、PR 作成・push も行っていない。

補助資料:

- [TypingMind 掲載](https://www.typingmind.com/skills/dreambigou-eli5):
  instructions-only、他 agent
  への配置についての第三者説明。実動作や品質の保証には使わない。
- [SkillsLLM 掲載](https://skillsllm.com/skill/eli5): 発見・掲載情報のみ。自動
  scan の PASSED 表示を安全性保証として扱わない。

取得原文・API snapshot はこの workspace の `.firecrawl/eli5-*` に保存し、VCS
対象外。

## 後続比較

[mizchi/explainer との比較](explainer-evaluation.md)では、日本語での技術理解・図解資料には
explainer を第一候補とした。ELI5 のローカル調整版を新しく作るより、explainer
の適用範囲と実行環境を絞って試す方を優先する。
