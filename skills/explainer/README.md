# explainer skills

`skills/` が Pi、Codex、Claude などで共有する canonical skills
です。特定ユーザーのグローバルな source path
を固定せず、各環境から共有スキルを参照してください。

## 自然な依頼から使う

skill
名やスラッシュコマンドを書かなくても、依頼の意図に応じて選択されます。たとえば:

- 「このコードを図解付きの解説資料にして」—
  読者に合わせた、根拠を確かめた速習資料
- 「章立ての学習資料を作って。演習も入れて」— 概念の順序と演習を備えた教材
- 「この下書きを想定読者の目線で読んで、どこで離脱するか教えて」—
  模擬ベータリーディング

通常の「レビューして」は既存の通常レビュー workflow
のままです。短いチャット説明では persona/documents を作りません。Pi
では現在のセッションに反映するため `/reload`
を一度実行してください。選択は依頼の意図に基づき、特定の言葉だけで決まるものではありません。使う
skill を明示したい場合は
`/skill:explainer`、`/skill:explainer-book`、`/skill:first-reader` で選べます。

## 実装をレビューする前に理解する

`/explain` または `/explain <対象・重点>`
で、変更の目的や仕組みを把握するための解説資料を作れます。これはコードレビューではなく、レビュー前に人が変更を理解するための入口です。Markdown
と HTML を作り、通常の explainer 手順に従って HTML を cmux
で開きます。レビュー所見や合格判定は作らず、自動レビューも実行しません。

## 初回セットアップ

Node 24 以上が必要です。依存は `skills/explainer/runtime`
だけに置き、対象アプリにはインストールしません。

```sh
bash skills/explainer/scripts/run.sh setup
```

## 主なコマンド

```sh
bash skills/explainer/scripts/run.sh verify <doc-dir> [--write]
bash skills/explainer/scripts/run.sh build <README.md> [...pages]
bash skills/explainer/scripts/run.sh figure <file> [--write]
bash skills/explainer/scripts/run.sh book <book-dir> [--write]
```

wrapper が `EXPLAINER_RUNTIME`
とブラウザーキャッシュを設定します。D2、スライド、形式手法ツール、アイコン、Vega、yomiyasu
は既定では含みません。必要に応じ、explainer の専用 runtime
にだけ追加してください。

## cmux で解説をプレビューする

検証後、生成 HTML（通常は `<doc-dir>/dist/index.html`）を cmux
ブラウザーで開きます。Markdown しかない場合は、たとえば
`bash skills/explainer/scripts/run.sh build <doc-dir>/README.md` で HTML
を生成します。すでに検証済み HTML があれば再ビルド不要です。本は目次 README
と全章を順番どおり build し、章ナビを保ちます。本文 Markdown
はそのままブラウザーに渡さないでください。

UI 操作の前に `CMUX_WORKSPACE_ID` が空でないこと、`cmux`
が使えること、`cmux ping`
が成功することを確認します。どれかを満たさなければ、Markdown / HTML
のパスと理由を伝えます。caller workspace の配置と右側 helper pane の再利用は
[`cmux-workspace`](../cmux-workspace/SKILL.md)、surface を開いた後の URL /
本文確認は [`cmux-browser`](../cmux-browser/SKILL.md) に従います。別 workspace
を推測したり、外部ブラウザーや公開サーバーに切り替えたりしません。詳しい file
URL の作り方、surface の選択と確認手順は
[`explainer` の「9. 渡す」](SKILL.md#9-渡す) を参照してください。

プレビューは検証を意味しません。Markdown と HTML のパス、実際の cmux
表示結果、`VERIFIED` の有無と検証範囲を報告します。`cmux markdown open`
は編集・live reload 用の任意機能で、標準の納品は cmux ブラウザーで開く HTML
です。

## 同梱例と更新記録

- `examples/event-emitter/` — 日本語の EventEmitter explainer の例
- `../explainer-book/` — 章立て book 用スキル
- `../first-reader/` — シミュレーション読者用スキル
- `UPSTREAM.md` — upstream URL、正確な snapshot SHA、ローカル変更と更新方針
