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

## 同梱例と更新記録

- `examples/event-emitter/` — 日本語の EventEmitter explainer の例
- `../explainer-book/` — 章立て book 用スキル
- `../first-reader/` — シミュレーション読者用スキル
- `UPSTREAM.md` — upstream URL、正確な snapshot SHA、ローカル変更と更新方針
