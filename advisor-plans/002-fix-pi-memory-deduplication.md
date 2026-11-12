# Plan 002: メモリ整理後も同じメモを重複保存しない

> **実行者への指示**: この計画を最後まで読み、各手順の検証結果を確認してから次へ進む。STOP 条件に該当したら独断で範囲を広げず報告する。完了後は `advisor-plans/README.md` の状態を更新する（親エージェントが管理すると指定された場合を除く）。
>
> **最初の drift check**:
>
> ```bash
> jj diff --from d143f5e013e07c3da7c9f4b6dbad4f5131900d67 --to @ --stat -- pi/agent/extensions/repo-memory-local.ts pi/agent/tests/repo-memory-local.node.test.mjs
> ```
>
> 対象に変更があれば、以下の現状抜粋と実コードを比較する。不一致を説明できなければ停止する。

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: なし。Plan 001 と独立
- **Category**: bug
- **Planned at**: base commit `d143f5e013e07c3da7c9f4b6dbad4f5131900d67`, 2026-11-11
- **Status**: DONE（2026-11-11、実装・親検証済み。詳細は `advisor-plans/README.md`）

## Why this matters

`review_memory` は日時なしの箇条書きへメモリを整理する。一方、`remember` の比較用 helper は「箇条書きの最初の単語」を日時として取り除いてしまう。整理後に同じ本文を `remember` すると重複と判定されず、メモリが増え、再整理や読み込みの手間になる。

実際の extension をインメモリ filesystem へ接続し、`- Use Bun for tests.` が存在する状態で同じ本文を保存すると、`Saved to repo memory.` が返り、1件が2件へ増えることを確認した。目的は、現在存在する2種類の保存形式を正しく比較し、既存データを変更せず重複保存を防ぐこと。

## Current state

### 対象コード

- `pi/agent/extensions/repo-memory-local.ts:16-23` の整理用 system prompt は、topic を見出しへまとめ、日時なしの箇条書きを指定する。

  ```text
  - Group items under ## <topic> markdown headings when a natural topic exists; otherwise a single ## general group.
  - Each item is a markdown bullet "- <note>", max 220 characters, no timestamps.
  ```

- 同ファイル `:76-80` の比較 helper は日時の形式を確認していない。

  ```ts
  const normalizeMemory = (text: string) => text.trim().toLowerCase();

  // Strip the "- <ISO> [topic] " prefix to compare only the note text.
  const bulletNoteText = (line: string) =>
    line.replace(/^-\s*\S+\s*(?:\[[^\]]*\]\s*)?/, "").trim();
  ```

- 同ファイル `:218-223` は既存の各箇条書きの本文を正規化し、完全一致で比較する。

  ```ts
  const alreadySaved = existingText
    .split("\n")
    .filter((line) => line.trimStart().startsWith("-"))
    .some((line) => normalizeMemory(bulletNoteText(line)) === normalized);
  if (normalized && alreadySaved) {
    return { content: [{ type: "text", text: "Already remembered." }] };
  }
  ```

- `remember` が追記する形式は次の2種類。日時は `new Date().toISOString()`。

  ```text
  - 2026-11-11T00:00:00.000Z [testing] Use Bun for tests.
  - 2026-11-11T00:00:00.000Z Use Bun for tests.
  ```

- `review_memory` 後の形式は次のようになる。

  ```markdown
  ## testing
  - Use Bun for tests.
  ```

### 既存テストの構造と規約

`pi/agent/tests/repo-memory-local.node.test.mjs` は Node の `node:test` / `assert/strict` を使う。`stripTypeScriptTypes` と `vm.SourceTextModule` で実際の extension をロードし、filesystem は private temporary HOME、AI completion は stub にしている。

- `setup(opts)`（`:163`）は `{ root, memoryPath, pi, ... }` を返す。`opts.memory` で初期メモリ、`opts.hooks.complete` で整理結果を指定できる。
- `wirePi()`（`:95`）は `pi.tools` と `pi.commands`、`pi.sessionStart()`、`pi.indexPrompt()` を用意する。
- `review(pi)`（`:147`）は登録済み `review_memory` tool を実行する。
- `baseCtx()`（`:131`）は UI なしの context を作る。
- `review_memory success removes backup, updates memory and index`（`:210`）が既存の統合テスト例。
- 一時ファイルの後始末は既存と同じ `t.after(() => rm(root, { recursive: true, force: true }))`。実 HOME のメモリは触らない。

既存の2入口（tool と slash command）は整理処理を共有している。今回の不具合は共通の保存済み形式と `remember` の組み合わせなので、同じ回帰を入口ごとに重複テストする必要はない。

## Commands you will need

| 用途 | コマンド | 期待結果 |
| --- | --- | --- |
| 状態確認 | `jj status; jj log -r @` | 割り当てられた変更と既存差分を確認できる |
| メモリテスト | `node --experimental-vm-modules --test pi/agent/tests/repo-memory-local.node.test.mjs` | 全成功。調査時の既存テストは13件 |
| TypeScript 構文 | `node --check pi/agent/extensions/repo-memory-local.ts` | exit 0。調査環境の Node 24 で確認済み |
| 既存 typecheck | `pi/agent/node_modules/.bin/tsc -p pi/agent/tsconfig.json` | exit 0。ただし既存設定の対象は `tests/assert.ts` のみ |
| 全体検証 | `bash scripts/run_tests.sh` | フォアグラウンドで実行し `All tests passed.` |

Node の `ExperimentalWarning` 自体は失敗ではない。ローカル SDK 0.83.0 の更新や、拡張全体への typecheck 範囲拡大はこの修正に混ぜない。依存の追加・更新は不要。

## Scope

**変更してよいファイル**:

- `pi/agent/extensions/repo-memory-local.ts` — `bulletNoteText` と必要最小限の説明コメント
- `pi/agent/tests/repo-memory-local.node.test.mjs` — 公開 tool を使う回帰テストと互換性確認
- `advisor-plans/README.md` — この計画の状態・検証結果

**変更禁止**:

- 保存先、ファイル名、timestamp/topic 付き追記形式、文字数・バイト数上限
- `normalizeMemory` の trim / case-insensitive な比較契約、完全一致の比較
- 整理用 system prompt、整理モデル、認証、backup・保存処理、UI、tool schema
- メモリの topic index 改修、既存メモリの移行・一括整理
- 他の拡張、resolver、SDK、lockfile、共有 skill、ユーザーの実メモリ

非自明な実装は `impl` skill の role `impl.default` へ委譲し、親が diff・lint 相当の構文確認・tests・仕様充足を検証する。モデル ID は直書きしない。実装前に現行 Pi の関連 docs/examples を読む。

## Git workflow

割り当てられた workspace/revision 内で作業する。別 PR を求められていないので bookmark を増やさない。push 済み revision なら追記せず `jj new` で積む。コミットメッセージを設定する場合は `JJ_EDITOR=true jj describe -m "Pi メモリ整理後の重複保存を防ぐ"` を使う。push・PR 作成・merge は実施しない。

## Steps

### Step 1: 既存の保存・整理テストの baseline を確認する

drift check を行い、現行の `bulletNoteText`、追記形式、`review_memory` の出力形式が上記と一致することを確認する。

**Verify**: `node --experimental-vm-modules --test pi/agent/tests/repo-memory-local.node.test.mjs` が全成功する。調査時は13件。既存失敗があれば勝手に別箇所を修正せず報告する。

### Step 2: 整理後の重複保存を公開 tool の回帰テストで Red にする

既存テストファイルに、例えば `remember skips duplicate after review_memory consolidation` というテストを追加する。

1. `setup()` に日時・topic 付きの既存メモを渡す。
2. `hooks.complete` から `## testing\n- Use Bun for tests.\n` を返す。実 AI は呼ばない。
3. `await review(pi)` で実際の整理 tool を通して保存形式を変える。
4. 整理後の `memory.md` を `readFile` して退避する。
5. 登録済み `remember` を次の形で実行する。

   ```js
   const result = await pi.tools.get("remember").execute(
     "",
     { note: "Use Bun for tests.", topic: "testing" },
     undefined,
     undefined,
     baseCtx(),
   );
   ```

6. 戻り値が `Already remembered.` で、ファイル内容が退避した内容と完全に同じことを検証する。件数だけ、内部 helper の戻り値だけのテストにはしない。
7. 既存テストと同様に一時ディレクトリの cleanup を登録する。

**Verify**:

```bash
node --experimental-vm-modules --test --test-name-pattern 'remember skips duplicate after review_memory consolidation' pi/agent/tests/repo-memory-local.node.test.mjs
```

現行コードでは `Saved to repo memory.` が返ることによって意図した assertion が失敗する。モジュール解決、fixture、権限など別理由で失敗した場合は Red と数えない。

### Step 3: 比較 helper だけを修正して Green にする

`bulletNoteText` で箇条書きマーカーを除き、続く文字列が既存 writer の ISO timestamp 形式の場合だけ、その timestamp と直後の任意の `[topic]` を除く。日時がない通常の箇条書きでは、先頭の単語も含めて本文を保持する。

必要なのは小さな条件付き prefix 除去のみ。汎用 Markdown parser、Date の正規化、形式 version、別の保存形式、依存ライブラリ、比較用の新しい抽象層は導入しない。現行の完全一致比較と `normalizeMemory` はそのまま使う。

**Verify**: Step 2 の focused command が成功し、`node --check pi/agent/extensions/repo-memory-local.ts` も成功する。実装の prefix 除去が日時のない本文を削らないことを diff で確認する。

### Step 4: writer の既存形式と非重複保存の契約を守る

同じファイルに、次の必要最小限の公開挙動テストを追加する。

- **既存 writer 形式**: 日時付きの箇条書きに対する同じ本文の保存は、`[topic]` あり・なしの両方で `Already remembered.` となり、ファイル不変。2形式を短い data-driven test にしてよい。これは prefix 判定を狭めたことで既存形式を壊すリスクを守る。
- **異なる本文**: 整理済みメモ `- Use Bun for tests and scripts` があるとき、本文 `Use Bun for tests` は新規保存される。戻り値が保存成功で、既存メモと新しい本文の両方が残ること。重複比較を substring 判定へ変えて有効なメモを捨てない契約を守る。

topic の網羅組み合わせ、推測的な Markdown 構文、内部 helper の export は追加しない。

**Verify**: メモリテスト全体が成功する。既存の backup 成功・失敗・cleanup 警告・キャンセルの13件を維持し、新規ケースも成功する。

### Step 5: 全体検証と引き渡し

`bash scripts/run_tests.sh` をフォアグラウンドで実行する。`impl` skill の scoped cccc policy に従い、変更 helper と追加処理を baseline / diff と比較する。テストの VM loader を改造したり、検証を通すためだけに公開 export を増やしたりしない。

**Verify**: 全テスト成功、構文確認成功、`jj diff --stat` / `jj diff` が Scope 内に収まる。`advisor-plans/README.md` に Red / Green・検証結果を記録する。

## Test plan

構造は既存 `review_memory success removes backup, updates memory and index` に合わせる。filesystem と公開 tool の結果を観測し、AI のみ既存 stub を使う。

- 主要回帰: 整理 tool を実行した後、同じ本文が再追記されない。
- 互換性: writer が生成する日時あり・topic 任意の2形式で、既存メモを重複保存しない。
- 有効な新規保存: 本文の一部だけが一致する異なるメモは捨てない。

実ユーザーの `review_memory` を呼び出したり、実メモリファイルを書き換えたりしない。

## Done criteria

- [x] Step 2 の回帰テストが、修正前に意図した重複保存として失敗した
- [x] 修正後は同じテストが成功し、整理後のファイル内容は同一のまま
- [x] 日時付きの既存2形式と、異なる本文の新規保存の確認が成功
- [x] `node --experimental-vm-modules --test pi/agent/tests/repo-memory-local.node.test.mjs` が全成功
- [x] `node --check pi/agent/extensions/repo-memory-local.ts` が exit 0
- [x] `bash scripts/run_tests.sh` が `All tests passed.`
- [x] `jj diff` は Scope 内のみ。実ユーザーのメモリ・保存形式・整理処理は未変更
- [x] `advisor-plans/README.md` の状態更新済み

## STOP conditions

- writer や整理用 prompt が上記とは異なる形式になっている。
- 修正に保存形式の移行、実メモリの変更、新規依存、loader の変更が必要になる。
- 有効なメモを誤って重複判定する、または既存の日時付き形式を壊す。
- テストが実際の AI・認証情報・実 HOME に依存する。
- 検証が妥当な修正を試しても2回失敗する。Scope 外の既存不具合を勝手に修正しない。

## Maintenance notes

整理結果の形式と writer の追記形式が異なることを忘れず、将来どちらかを変えるときも共通の本文比較契約を維持する。今回の helper 修正で、過去にすでに保存された重複が自動削除されるわけではない。その整理はユーザーの依頼があるときだけ別途行う。topic index の見出し対応や保存の atomicity は別件であり、この修正へ混ぜない。
