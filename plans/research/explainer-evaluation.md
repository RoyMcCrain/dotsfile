# mizchi/explainer と ELI5 の比較・導入判断

- 調査日: 2026-10-15
- 対象: [mizchi/explainer](https://github.com/mizchi/explainer)
- 確認 revision: `ccdd7bacfb47451e38506d837af8a629504960b2`
- plugin version: `0.5.3`
- 比較対象: [DreambigOu/ELI5 の先行調査](eli5-evaluation.md)
- 状態: 調査後に基本3 skills と専用 runtime
  を導入済み。末尾の「導入・動作確認」を参照。以下の未実施の記述は調査時点のもの。

## 結論

**日本語でコード・設計・新しい技術を理解する資料が欲しいなら、ELI5 より
explainer を優先する。**

ELI5 は読者の属性に合わせる説明テンプレート。explainer
は、読者の既知・未知を整理し、必要な差分を、実行結果・図・文書で説明するワークフロー。一般的な「わかりやすく説明して」から増える機能は
explainer の方が大きい。

ただし、軽量なプロンプト追加ではない。共有 skill
と実行用の依存環境を分け、明示的な資料作成で使い始めるのがよい。ELI5
と両方を広い自動発動で入れる必要はない。

## 比較

| 観点           | DreambigOu/ELI5                      | mizchi/explainer                                                     |
| -------------- | ------------------------------------ | -------------------------------------------------------------------- |
| 読者の扱い     | 年齢・職種などの型                   | 個人の既知・未知・読む目的を記録する persona                         |
| 主な成果物     | チャットの説明文                     | 速習資料、図を含む Markdown / HTML、章立て教材                       |
| 正確性への方針 | 本文に「80% accuracy」を許容する記述 | 実行・照合し、未検証を明記する方針。ただし検証範囲には限界あり       |
| 図             | 専用ツールなし                       | Mermaid / D2 / SVG / HTML、データ図は Vega-Lite                      |
| 図の確認       | LLM の説明に依存                     | 描画し、文字の重なり・はみ出し・矢印・事実シート等を確認             |
| 日本語         | 英語主体、日本語評価なし             | 日本語の skill・文体ルール・README。yomiyasu lint 連携は任意         |
| 理解の確認     | 専用機能なし                         | 理解度チェックと first-reader の模擬読者。人間の理解度の実測ではない |
| 導入負担       | Markdown 1ファイル                   | Node、npm dependencies、Chromium 等。追加ツールは用途次第            |

## この環境に合う点

- 幼児向けに落とすのではなく、「既に知っている基礎は省き、曖昧な部分を説明する」ため、開発者の学習に向く。
- 主張と推測、出典、実行した結果、未検証を区別する。先行調査で懸念した ELI5
  の正確性方針より合う。
- 図と HTML を作れるので、単なる説明スタイル調整に留まらない。HTML builder は
  SVG・ローカル画像を埋め込む実装。
- 既存の implementation-report / review-report は実装・差分の検証用。explainer
  は「その変更や概念を読者が理解する」ためのもので、用途が異なる。
- Node は実環境で `v24.12.0` を確認。upstream の `>=24` 要件を満たす。

## 導入負担と境界

公式には Claude Code plugin、npx skills、APM の導入手順がある。plugin は5 skills
を含む。

- 基本の組: `explainer`、`explainer-book`、`first-reader`。README
  は3つの同時導入を推奨し、book は隣の explainer scripts を参照する。
- 追加の組: `d2-diagram`、`d2-slides`。D2 を使う段階で検討する。
- 基本依存: Node 24+、`@mizchi/vlmkit`、`marked`、`playwright`、`mermaid`
  とブラウザ実行環境。
- 任意依存: D2 CLI、Vega / Vega-Lite、Iconify。Python 3 は first-reader
  に必要。TLC / Java / Apalache / Z3
  は形式手法の例向けで、通常の説明に一括導入する必要はない。
- `yomiyasu` は同梱されず、lint 結果も警告候補であり、事実正確性の判定ではない。

Pi / Codex 用には、既存 repo の `skills/` → `~/.agents/skills/`
方式へ載せる候補。ただしスクリプトは資料側リポジトリや cwd の npm dependencies
を解決するので、skill ファイルの配置だけで全機能が動くわけではない。first-reader
は独立した subagent も要求するため、その実行方式の適合確認が必要。今回 Pi /
Codex で実動作確認はしていない。

同梱 `scripts/setup-d2.sh` は Linux amd64 の archive を固定で取得する。macOS
でそのまま使わず、D2 が必要になったら macOS 向けの導入方法を選ぶ。

## そのまま全自動で使わない理由

### 検証コマンドを実行する

`verify-doc.mjs` は `checks.json` の `cmd` を `sh -c`
で実行し、親環境の環境変数も引き継ぐ。これは出力を再現する設計であり、sandbox
ではない。第三者の資料や生成された checks
を、内容未確認のまま実行しない。秘密情報・本番操作・外部送信を含めない独立した作業環境で使う。

Markdown / HTML / SVG も描画対象になる。builder は信頼できない HTML
を安全化する仕組みではないので、生成物を無条件に安全な文書として扱わない。

### VERIFIED は全事実の保証ではない

照合対象は定義した checks、注釈付き引用、図の facts
と表示など。本文全体の意味が正しいことや、facts
自体の正しさを一般的に証明するものではない。

静的確認では、checks の実行結果から `out` だけを取り出し、command
の終了コードを合否に使っていない。期待する文字列が出た後に command
が失敗しても、その check が通り得る。導入時にこの挙動を理解し、重要な判定で
VERIFIED 表示だけを根拠にしない。今回は実行による再現はしていない。

### 通常の会話には重い副作用がある

skill は広い説明依頼でも発動し、質問に答えてもらう前に `personas/<id>.md`
を書く。さらに模擬読者と検証の繰り返しを含む。毎回の短い質問に適用すると、ファイル作成・待ち時間・推論コストが増える。

導入するなら、まず資料作成を明示したときに使う。通常の短い説明では勝手に persona
ファイルや npm dependencies を増やさない。個人情報を含む persona と
`.first-reader/` の保存先・VCS 対象も決めておく。

## おすすめする採用範囲

1. ELI5 の独自版を作る案より、explainer を第一候補にする。
2. 基本3 skills の隣接構造と、upstream revision・LICENSE / NOTICE を保持する。D2
   / slides / 形式手法ツールは必要になるまで追加しない。
3. 共有 skills と資料生成用の依存環境を分ける。説明対象のアプリへ毎回 npm
   dependencies を勝手に追加しない。
4. 明示的な資料生成から試し、公開コードを題材に1本の日本語資料で、既知の省略・事実関係・図の可読性・コストを確認する。
5. jj リポジトリでは skill にある git diff の例を jj
   に合わせる。グローバルな権限・外部送信・実装委譲のルールは維持する。

## 根拠と調査の限界

- [日本語 README](https://github.com/mizchi/explainer/blob/ccdd7bacfb47451e38506d837af8a629504960b2/README.ja.md)
- [explainer SKILL.md](https://github.com/mizchi/explainer/blob/ccdd7bacfb47451e38506d837af8a629504960b2/skills/explainer/SKILL.md)
- [日本語を含む文体ルール](https://github.com/mizchi/explainer/blob/ccdd7bacfb47451e38506d837af8a629504960b2/skills/explainer/references/writing.md)
- [verify-doc.mjs](https://github.com/mizchi/explainer/blob/ccdd7bacfb47451e38506d837af8a629504960b2/skills/explainer/scripts/verify-doc.mjs)
- [build-html.mjs](https://github.com/mizchi/explainer/blob/ccdd7bacfb47451e38506d837af8a629504960b2/skills/explainer/scripts/build-html.mjs)
- [package.json](https://github.com/mizchi/explainer/blob/ccdd7bacfb47451e38506d837af8a629504960b2/package.json)
- [第三者による比較と Codex での使用例](https://blog.lai.so/eli5-archify-explainer-skills/)。ここでの
  ELI5 は Anthropic community 版であり、今回比較した DreambigOu
  版とは別。explainer の使用例のみ補助根拠にした。

Firecrawl の一次資料、GitHub API の固定 revision のソース、Antigravity
の独立調査、Grok X Search を突き合わせた。Grok
の作者投稿は図解の用途と限界の補助に留める。Antigravity
の「安全」「正確性を担保」などの強い表現は採用せず、ソースで確認できる範囲に限定した。

取得時点の stars は443、forks は10、最終 push は2026-10-10。MIT License、同梱
first-reader は
Apache-2.0。人気や作者評価は安全性・実用性の保証にはしていない。今回は依存の全面監査、スクリプト実行、ブラウザ検査、実際の資料生成は未実施。

取得原文はこの workspace の `.firecrawl/explainer-*` に保存し、VCS 対象外。

## 導入・動作確認（2026-10-15）

- 固定 revision の `explainer` / `explainer-book` / `first-reader` を `skills/`
  に取り込み、LICENSE / NOTICE と出典を保持。3つとも
  `disable-model-invocation: false` とし、自然言語の依頼意図に応じて Pi
  が選択できる。短いチャット説明では persona/documents
  を作らず、一般的な「レビューして」は `parallel-review` のままにする。
- ユーザーの新しい要望「スラッシュコマンドなくても起動するようにしたい」に応じ、skill
  名やスラッシュコマンドを必須としない intent-based selection に変更。
- `~/.agents/skills/` にこの workspace の canonical skills へのリンクを作成。Pi
  / Codex 向けの共有登録は有効。Claude 用の相対リンクはこの workspace の
  `claude/skills/` に追加したが、普段の default workspace に向いた
  `~/.claude/skills` は変更していない。
- `skills/explainer/runtime` だけに固定 npm dependencies と Chromium を配置。D2
  / slides / Java / Z3 / Vega / Iconify / yomiyasu は未導入。`run.sh` が runtime
  と専用ブラウザキャッシュを指定し、資料の対象アプリへ依存を追加しない。
- runtime 解決は upstream の3 scripts
  を最小変更。検証コマンドが期待出力を出して終了7になるケースは、upstream
  が誤って合格し、ローカル版は失敗することを実行確認した。意図した失敗を教材にする場合は、その終了状態を
  command 自身で明示的に検査する。
- [日本語の実行可能なデモ](../../skills/explainer/examples/event-emitter/README.md)
  を作成。Node.js の EventEmitter と microtask の順序を、実行例・実出力・Mermaid
  の図・理解度チェックで説明する。実在ユーザーのプロフィールは使っていない。
- 別の package.json がある cwd から wrapper を実行し、対象側に node_modules
  を追加せずに完了。実行結果・ソース引用・出力引用・図の facts / 描画・HTML
  の開閉状態の integrity・contrast を検査し、最終結果は `VERIFIED`。cmux
  のブラウザでも図の表示と答えの開閉、ブラウザエラーなしを確認した。
- `first-reader` の scanner view を新しい隔離 Pi
  に渡す簡易スキムも実施。「読み進める」という模擬読者の応答を得た。これは実在の人間の評価、完全な
  timed read、翌日の記憶の実測ではない。
- 親側検証: 新規 Bats 4件、既存 shared-skill Bats 6件、既存 portability
  2件が通過。Node 構文、ShellCheck、shfmt、frontmatter も確認。新規 demo は
  cognitive 0 / cyclomatic 1。変更した vendor scripts の関数別 complexity は
  baseline と一致し、未変更の既存違反だけが残る。全 vendor
  が閾値内という意味ではない。

使い方は [skills/explainer/README.md](../../skills/explainer/README.md)。Pi は
現在のセッションで一度 `/reload` すると、資料作成や模擬ベータリーディングの
自然言語の意図から選択できる。選択は特定語句による決定的なトリガーではない。
`/skill:explainer`、`/skill:explainer-book`、`/skill:first-reader` は明示的に
選びたい場合の fallback として引き続き利用できる。生成 HTML は demo の
`dist/index.html`、簡易スキム結果は `.first-reader/quick-skim.md` に保存し、
いずれも VCS 対象外。

共有リンクの参照元はこの workspace。default
へ変更を取り込んで通常のセットアップでリンクを張り直すまでは、この workspace
を削除しない。PR 作成・push は行っていない。
