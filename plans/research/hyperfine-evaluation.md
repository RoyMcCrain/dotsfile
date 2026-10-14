# hyperfine 導入判断

調査日: 2026-10-15

## 結論

導入を推奨。ただし必須の検証ツールではなく、CLI・シェルスクリプトの性能変更を比較する補助ツールとして使う。導入するなら既存の CLI 管理方針に合わせて Devbox に寄せる。初回調査ではインストールや設定変更は行わず、下記はその後の導入結果。

## 導入結果

- `devbox/devbox.json` に `hyperfine@latest` を追加し、`devbox global install` で 1.21.0 を導入した。
- 既存パッケージの lock に変更がないことを確認した。global の `devbox.lock` はリポジトリ外で管理されている。
- fish からの起動、2 コマンドの反復比較、JSON / Markdown 出力を smoke test で確認した。

## この環境での用途

- fish の起動時間を設定変更の前後で比較する。
- 同じ仕事をする旧・新スクリプトの実行時間を比較する。
- AI による高速化の主張を、反復計測とばらつきで検証する。
- Markdown / JSON に結果を保存し、PR や改善記録に添付する。

単発で所要時間を知るだけなら shell の `time` で十分。関数や行単位のボトルネック調査には別途 profiler を使う。

## 公式 README で確認できた機能

- 複数回実行の統計、複数コマンドの比較、外れ値の検出。
- `--warmup`、各回の事前処理を指定する `--prepare`。
- `--export-markdown` / `--export-json` などの出力。
- macOS / Linux を含むクロスプラットフォーム対応。
- 現在の README は実行時間に加えて peak RSS やハードウェアカウンタも説明している。対応範囲は OS・指標ごとに異なる。
- 調査時の upstream README では直接実行が既定。一方、Devbox で導入された 1.21.0 は中間 shell の利用が既定で、`--shell=none` / `-N` で直接実行になる。fish 構文を使う場合は `--shell fish` を指定する。版による違いがあるため、導入版の help を優先する。

## 使用例（未実行）

出力先の `bench.md` は例です。実行前に未使用の安全なパスへ置き換え、既存レポートを上書きしないでください。

```sh
# キャッシュが温まった状態での interactive fish 起動時間
hyperfine --shell none --warmup 3 'fish -i -c exit'

# 同等の処理を行うスクリプトの比較。ファイル名は例。
hyperfine --shell none --warmup 3 --export-markdown bench.md \
  'bash before.sh' 'bash after.sh'
```

## 注意点・判断

- コマンドはウォームアップを含めて繰り返し実行される。API 課金、書き込み、削除等の副作用があるものを安易に測らない。
- warmup は温かいキャッシュの計測用。初回起動を評価したい場合は別の条件設計が必要。
- ビルドの比較では clean / incremental を揃える。ファイル検索等でも結果や対象範囲が同等であることを先に確認する。
- 外部 API / LLM の総所要時間は計測できるが、ネットワーク・サービス側の揺れを分離できない。TTFT 等の専用指標の代替にはしない。これはツールの用途からの判断。

## 突き合わせ

Firecrawl で取得した公式 README を主根拠に、Antigravity の横断整理と Grok X Search の作者投稿・利用者議論を比較した。反復比較・warmup・キャッシュ条件の重要性は整合する。Antigravity の「RAM 指標がない」等の記述は現在の README と矛盾するため不採用。X 上の古い shell 既定動作の説明も現行仕様の根拠にはしない。

## 出典・保存資料

- 公式: https://github.com/sharkdp/hyperfine#usage
- 公式 shell 動作: https://github.com/sharkdp/hyperfine#intermediate-shell
- 公式指標: https://github.com/sharkdp/hyperfine#choosing-metrics-and-units
- 公式 export: https://github.com/sharkdp/hyperfine#exporting-results
- 作者の公開投稿（歴史的背景）: https://x.com/sharkdp86/status/1262688848900915200
- 取得資料: `.firecrawl/hyperfine-evaluation-web.json`、`.firecrawl/hyperfine-evaluation-agy.md`、`.firecrawl/hyperfine-evaluation-grok-x.json`
