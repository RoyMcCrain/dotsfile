# Pi Implementation Plans

2026-11-11、`improve` による読み取り専用監査を受け、ユーザーが選択した2件を実施計画へ整理した。

**2件とも実装・親検証が完了。実ユーザーのメモリ、モデル設定、インストール済み Pi 本体は変更していない。**

基準 revision: `d143f5e013e07c3da7c9f4b6dbad4f5131900d67`（公開済み main。計画時のローカル snapshot と対象ソースは同一）。既存 `plans/` は `plans/research/` の調査資料に使われているため、今回の引き渡し計画は `advisor-plans/` に分離する。

## Execution order & status

各実行者は対象計画を最後まで読み、drift check・STOP 条件・Scope を守ること。実装は `impl` skill の role `impl.default` を使い、親エージェントが diff・lint・tests・仕様充足を確認する。push・PR 作成・merge はこの計画への合意に含めない。

| Plan | Title | Priority | Effort | Risk | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| [001](001-remove-obsolete-pi-token-clamps.md) | Pi 本体と重複する出力トークン補正を撤去 | P2 | S | LOW・runtime 確認済み | — | DONE |
| [002](002-fix-pi-memory-deduplication.md) | メモリ整理後の重複保存を防止 | P2 | S | LOW | — | DONE |

状態: `TODO` / `IN PROGRESS` / `DONE` / `BLOCKED`（理由を添える）/ `REJECTED`（理由を添える）。

## Dependency notes

- 両計画は独立しており、001 → 002 の順を推奨するが、実行順の依存関係はない。
- 001 は実 runtime の下限16の補正確認を撤去より先に行う。旧版対応が必要なら保留し、002 だけ進めてよい。
- 001 はセットアップ fixture の旧パッチスタブ削除で Red、呼び出し撤去で Green を確認する。
- 002 は整理後の同一メモ保存を公開 tool で Red にしてから helper を修正する。
- 実装後は全体テストをフォアグラウンドで実行する。関連する未修正の既存失敗があれば、勝手に範囲を広げず baseline と併せて報告する。

## Verified baseline

監査・計画作成時に確認した結果。将来の実行成功を代替するものではない。

| 検証 | 結果 |
| --- | --- |
| Pi の `*.test.ts` を Bun で実行 | 144件成功 |
| `node --experimental-vm-modules --test pi/agent/tests/repo-memory-local.node.test.mjs` | 13件成功 |
| `bats pi/agent/tests/resolve-model.bats` | 47件成功 |
| `bats scripts/tests/setup.bats` | 11件成功 |
| `shellcheck scripts/build_env/setup.sh` | exit 0 |
| `shfmt -d scripts/build_env/setup.sh` | 差分なし、exit 0 |
| `node --check pi/agent/extensions/repo-memory-local.ts` | exit 0 |
| `pi/agent/node_modules/.bin/tsc -p pi/agent/tsconfig.json` | exit 0。ただし対象は既存の `tests/assert.ts` のみ |
| Pi 1.5.2 の OpenAI Responses `stream` / `streamSimple` | `maxTokens: 1` → payload の `max_output_tokens: 16`、ネットワーク0回 |
| 整理済みメモへの同一本文の `remember` | 重複保存を再現。1件 → 2件（隔離 fixture） |

計画作成時点では全リポジトリのテストは未実行だった。実装後の実行結果は以下のとおり。

## Implementation verification — 2026-11-11

- 実装は `impl.default` の隔離 Pi 子プロセスへ委譲し、親が全差分・変更範囲・検証結果を確認した。変更対象は計画の実装8ファイルと計画記録のみ。
- 001: 独自 clamp 拡張と npm global 改変パッチを削除。setup・devbox の呼び出し、テスト fixture の不要なスタブ、README の旧案内も撤去した。
- 002: `bulletNoteText` は writer の ISO timestamp がある場合だけ metadata を除去し、整理済みの通常箇条書きでは本文の先頭を保持する。保存形式・比較の完全一致契約は変更していない。
- 親側でも修正前 revision のソースと新しいテストを一時ディレクトリへ組み合わせて Red を再現した。メモリは `Saved to repo memory.` と `Already remembered.` の不一致、setup は欠落した旧パッチ呼び出しによる status 127 として失敗した。
- 修正版のメモリ17件・setup 11件は親側でも全成功。追加4ケースは整理後の重複保存、writer の topic あり・なし、異なる本文の保存を保護する。
- `bash scripts/run_tests.sh` を親がフォアグラウンド実行し、**All tests passed.**。Bun 494件、Node 23件、Bats 383件（19 suites）が成功した。上記のfocusedテストはこれらに含まれる。
- `shellcheck scripts/build_env/setup.sh`、`shfmt -d scripts/build_env/setup.sh`、memory extension の `node --check`、devbox JSON 検証も成功。全体 runner の既存2つの tsc 検証も成功した。ただし拡張全体の型検査を新設したわけではない。
- cccc は before/after と diff を照合し、`bulletNoteText` は cognitive 0→1 / cyclomatic 1→2。追加処理に WARNING/hard はなく、未変更関数の悪化もない。
- Pi 1.5.2 の OpenAI Responses の offline `stream` / `streamSimple` 確認は撤去前後とも指定値1を16へ補正し、ネットワーク呼び出し0回だった。2026-11-12 には Azure Responses の両関数も追加確認し、合計4経路で同じ結果を得た。`pi scripts devbox` 内の旧パッチ・旧拡張参照は該当なし。
- runtime の API ディレクトリを調べ、`max_output_tokens` を代入する実装は OpenAI / Azure Responses の2つで、どちらも下限16の補正を持つと確認した。共有 helper の同名文字列は応答の終了理由の比較であり、出力パラメータの生成ではない。`setup-npm` は版固定なしの指定だが、動作検証対象は実際に起動する managed Pi 1.5.2 であり、未確認の旧版の互換性は主張しない。
- 現在の Pi セッションへ反映するには `/reload` または再起動する。実際の AI 呼び出しによる compaction や旧版 Pi の確認は実施していない。実装完了時点では push・PR 作成は未実施。

## Deferred findings

- `pi/agent/resolve-model.sh` の `current` / `agy` reviewer 分岐整理: 今回は選択されていないため計画化しない。固定 Codex + Claude tiers の実利用と、既存 CLI の互換性を切り分ける必要がある。単体調査等の `.agy` role を削除する話ではない。
- 無効化済み5拡張のソース削除: opt-in 用の保持は意図的。将来の利用予定が決まるまで削除を計画しない。
- SDK と runtime の版合わせ、拡張全体の typecheck、メモリ topic index・保存方式の変更: 今回の2件へ混ぜない。

## Findings considered and rejected

- `cmux-session.ts` と `cmux-session-name.ts` の統合・削除: 前者は通知・再開連携、後者は Pi のセッション名同期であり、同じ処理の重複ではない。
- 無効化済み拡張の削除を起動高速化として提案すること: 現在は読み込み対象外なので、削除の主効果は保守対象の削減に限られる。
- ドキュメント文面や source の文字列だけを固定する新規テスト: 実行可能なセットアップ・メモリ保存の契約を既存のテスト基盤で検証する方が適切。

## Audit boundary

対象は `pi/agent/` のローカル設定・拡張と、今回の撤去に直接関係するセットアップ経路。Pi 本体全体、外部の個人スクリプト、cmux UI の実操作、実 API 通信による compaction、既存メモリの整理は対象外。
