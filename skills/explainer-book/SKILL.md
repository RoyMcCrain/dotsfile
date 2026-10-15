---
name: explainer-book
description: 章立てで概念を順に学び、演習で身につける学習資料・チュートリアルを作る依頼に使う skill。たとえば「章立ての学習資料を作って」「演習付きのチュートリアルにして」のような自然な依頼で選ぶ。/skill 名の指定は不要。短いチャット説明、一般的なレビュー、無関係な依頼には使わない。
disable-model-invocation: false
---

# explainer-book

章立ての学習資料や演習付き教材を作る自然言語の依頼で使う。skill 名やスラッシュコマンドの指定は不要。本の依頼でない通常の「レビューして」は既存の `parallel-review` に任せ、短いチャット説明では persona/documents を作らない。

## このスキルを使うときの安全・作成ポリシー
- 文書作成を明示的に依頼された場合だけ persona/documents を書く。短いチャット説明ではファイルを作らない。
- 対象アプリへ依存を自動インストールしない。個人の非公開情報を集めず、ユーザーの実際の発言と推論を分ける。
- コード識別子は原文どおりに保つ。jj 管理のリポジトリでは git ではなく jj を使う。
- 生成したチェックリストは実行前に人が確認する。秘密情報、破壊的操作、ネットへの投稿、本番アクセスは禁止。
- VERIFIED は実行したチェックの範囲だけを指し、事実全般の正確性を保証しない。

`explainer` の本版。
1 本の速習資料（20 分以内・例 1 つずつ）で足りないとき、章に分けて、**手を動かして身につける**資料にする。

ペルソナ・図・検証の仕組みは `explainer` をそのまま使う。先に `../explainer/SKILL.md` を読むこと。
このスキルが足すのは、本全体の設計と検査。

スクリプトは、このスキルのディレクトリ（以下 `<skill>`）の `scripts/` にあります。
`verify-book.mjs` は、隣の `explainer` スキルの `scripts/verify-doc.mjs` を呼びます。2 つのスキルは同じ場所に入れてください。
依存は隣の explainer スキルの `<explainer-skill>/runtime` にだけ置きます。Node 24 以上が必要です。初回は `bash <explainer-skill>/scripts/run.sh setup` を実行し、対象アプリにはインストールしません。追加ツールは explainer の「準備」を参照してください。

## いつ本にするか

次のどれかに当てはまったら本にする。1 つも当てはまらなければ、`explainer` の 1 本で書く。

- 読了が 20 分を超える
- 読み手が手を動かす演習が要る（読むだけでは「判定できる」ようにならない）
- 概念に順序がある（A を知らないと B が読めない）

## 構成

```
<topic>-book/
  README.md            目次：想定読者、章ごとの「読み終えたらできること」、章の依存図、再現方法
  book.json            章の順序・学習目標・導入する概念・演習（references/book-json.md）
  01-quickstart.md     最初の章は必ず quickstart：理論の前に、動く結果に着く
  02-….md              concept：1 章 1 つの判定を身につける
  03-….md              practice：演習が中心
  checks.json          本文の出力と演習の答えを再生成するコマンド（explainer と同じ形式）
  examples/            章で使うコード・モデル。演習の出発点と答えを別ファイルにする
  figures/             book-map.*（生成）と各章の図
```

## 手順

```
1. ペルソナ     explainer と同じ。「怪しいところ」から、本全体の問いを 1 つ決める
2. 目標を並べる  問いに答えるために読み手ができるべき判定を 3〜6 個。1 章に 1〜2 個
3. 概念の順序   各判定に要る概念を書き出し、どの章で導入するかを決める（book.json introduces / requires）
4. 実物を先に   各章の例と演習を作り、走らせる。演習は「出発点で落ちる」「答えで通る」を両方確かめる
5. 章を書く     explainer の writing.md の型。章の冒頭に所要時間とゴール、末尾に理解度チェック
6. 検証         bash <explainer-skill>/scripts/run.sh book <book-dir> [--write]
7. 読ませる     first-reader で、少なくとも 01-quickstart と演習の章を、ペルソナ本人に読ませる（explainer の手順 8）
8. 渡す         dist/index.html と、各章の 1 行要約。未検証の点を明記
```

### 2. 学習目標

目標は「読み終えたら、何を判定できるか」で書く。「〜を理解する」は検査できないので書かない。

- 悪い例：「CTI を理解する」
- 良い例：「CTI が出たとき、条件が弱すぎるだけか、性質が本当に破れるかを TLC で判定できる」

各目標には、理解度チェックの問いを 1 つ以上付ける（`<!-- quiz: <目標id> -->`）。

### 3. 概念の順序

- ペルソナが既に知っている概念は `assumed` に書く。説明しない。
- それ以外の概念は、ちょうど 1 つの章が `introduces` する。その章より前の章の本文に出てきたら、検証が落ちる。
- 章が前提にする概念は `requires` に書く。依存図の矢印になる。

### 4. 演習

演習の答えも実行して確かめる。答えが間違った演習は、間違いを教える。

| kind | 例 | 検査 |
|---|---|---|
| `write` | 条件・関数・設定を書かせる | `starter`：出発点のまま実行すると**落ちる**ことを確かめる check。`answer`：答えで**通る**ことを確かめる check |
| `check` | 道具を回して判定させる | `answer`：判定の根拠になる出力を再生成する check |

- 答えは、演習と同じ節の `<details>` に入れる。
- 演習の前に `<!-- exercise: <id> -->` を置く。

### 5. 章を書く

`explainer` の文体に加えて、次を守る。

- 冒頭の引用ブロックに、所要時間・ゴール（その章の目標）・前提（前の章）を書く。
- 末尾で次の章へリンクする（`→ [02 …](02-….md)`）。HTML では前後の章と目次へのナビが付く。
- 前の章の結果を使うときは、章番号で参照する（「1 章の 3 つの check」）。同じ説明を繰り返さない。
- 手で推論した結果（「この状態には着けない」「この順序で起きる」）は、道具の出力に置き換える。推論は外れる。

### 6. 検証

```sh
bash <explainer-skill>/scripts/run.sh book <book-dir>
bash <explainer-skill>/scripts/run.sh book <book-dir> --write
bash <explainer-skill>/scripts/run.sh build <book-dir>/README.md <book-dir>/01-quickstart.md [...pages]
```

wrapper が `EXPLAINER_RUNTIME` とブラウザーキャッシュを設定します。upstream の参照コマンドは wrapper 経由、または専用 runtime の明示的な指定で実行してください。

本全体の検査：

| 検査 | 落ちる条件 |
|---|---|
| chapters | 章ファイルがない。`NN-` の番号が book.json の順と違う。1 章が quickstart でない |
| objectives | quiz が付いていない目標がある。quiz が他の章の目標を名指ししている |
| concepts | 概念を導入より前の章で使っている。`requires` が導入されていない。`introduces` と宣言したのに本文に出てこない |
| budget | 本文の推定読了時間（500 字/分 + コード 15 行/分）が `minutes` を超える |
| exercises | 印がない。答えが `<details>` にない。check が checks.json にない。`write` 演習に落ちる starter がない |
| map | `figures/book-map.*` が book.json と一致しない。README に図がない |

そのあと、README と全章を wrapper 経由で `verify-doc.mjs --pages` に渡す。出力の引用、図、ページ間リンク、各ページの vlmkit ゲートを検査する。`checks.json` の各コマンドは終了コード 0 かつ期待する出力の一致が必要。演習で意図した失敗を示す場合は、終了コードを保存して期待値を明示的に検査し、検査コマンド自体は 0 で終了させる（例：`tool; status=$?; test "$status" -eq 7`）。出力だけでは失敗を合格扱いにしない。

`book verdict: VERIFIED` になるまで直す。

## やってはいけないこと

- **章を増やして薄める。** 1 章に目標がない、または理解度チェックが目標を問わないなら、その章は要らない。
- **演習の答えを走らせない。**
- **前の章の説明を繰り返す。** 章番号で参照する。
- **検証を通すために言い換える。** 概念の検査に落ちたら、定義を前の章に移すか、章の順序を見直す。同義語に置き換えて逃げない。

## ファイル

| パス | 内容 |
|---|---|
| `references/book-json.md` | book.json の全フィールド |
| `scripts/verify-book.mjs` | 本全体の検査 → verify-doc.mjs |
| `../explainer/scripts/build-html.mjs` | 複数ページを HTML に（目次・前後の章へのナビつき） |
