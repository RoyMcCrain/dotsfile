# book.json

```json
{
  "title": "帰納的不変条件を自分で見つける",
  "persona": "../../personas/mizchi.md",
  "assumed": ["TLA+", "TLC", "Apalache"],
  "aliases": { "CTI": ["帰納法の反例"] },
  "charsPerMinute": 500,
  "codeLinesPerMinute": 15,
  "chapters": [
    {
      "file": "01-quickstart.md",
      "short": "クイックスタート",
      "kind": "quickstart",
      "minutes": 10,
      "requires": ["Apalache"],
      "introduces": ["帰納的不変条件"],
      "objectives": [{ "id": "run-three", "text": "…を示せる" }]
    }
  ],
  "exercises": [
    { "id": "ex-handoff", "chapter": "03-strengthening.md", "kind": "write",
      "starter": ["apa-handoff-start"], "answer": ["apa-handoff-step"] }
  ]
}
```

## 本全体

| フィールド | 必須 | 意味 |
|---|---|---|
| `title` | ✓ | 本の題。依存図の見出しに使う |
| `persona` | | ペルソナファイルへのパス（記録用） |
| `assumed` | | ペルソナが既に知っている概念。`requires` に書いてよく、どの章も導入しない |
| `aliases` | | 概念の別名。`{"概念": ["別名", …]}`。導入より前の使用を、別名でも検出する |
| `charsPerMinute` | | 読了時間の推定。既定 500（日本語の黙読） |
| `codeLinesPerMinute` | | 既定 15 |

## 章（`chapters[]`、読む順）

| フィールド | 必須 | 意味 |
|---|---|---|
| `file` | ✓ | `NN-name.md`。NN は配列の順（01 から） |
| `short` | | 依存図のラベル |
| `kind` | ✓ | `quickstart`（1 章は必ずこれ）/ `concept` / `practice` / `reference` |
| `minutes` | ✓ | 読了時間の予算（演習の時間は含めなくてよい） |
| `objectives` | ✓ | `{id, text}`。text は「〜できる」。各 id に `<!-- quiz: id -->` が要る |
| `introduces` | | この章で定義する概念。これより前の章の本文に出てはいけない |
| `requires` | | この章が前提にする概念。前の章の `introduces` か `assumed` にあること |

本文の検査は、コードブロック、HTML コメント、`<details>` の中身を除いて行う。
答えの中で後の章の用語に触れるのは許す。

## 演習（`exercises[]`）

| フィールド | 必須 | 意味 |
|---|---|---|
| `id` | ✓ | 章の中の `<!-- exercise: id -->` と対応 |
| `chapter` | ✓ | 演習がある章のファイル |
| `kind` | ✓ | `write`（書かせる）/ `check`（回して判定させる） |
| `starter` | `write` で ✓ | 出発点のまま実行すると落ちることを確かめる check 名。check の `expect` に「落ちた」ことを示す行を書く |
| `answer` | ✓ | 答えで通ることを確かめる check 名 |

## 生成されるもの

`verify-book.mjs --write` が `figures/book-map.mmd`（Mermaid）と `figures/book-map.facts.json` を作り、`figure-check.mjs` が `figures/book-map.svg` を描く。
図に題は入れない（長い本の題はスマホではみ出した）。矢印の意味は README の本文に書く。

- 章 1 つが 1 つの箱（`ch01`, `ch02`, …）
- 矢印 `chNN -> chMM`：NN 章が、MM 章で導入した概念を `requires` している

README に `![章の依存](figures/book-map.svg)` を置く。
