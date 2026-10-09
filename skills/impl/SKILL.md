---
name: impl
description: 分離 Pi 子プロセス（role impl.default / GPT-6 Luna High）に実装まで委譲する
---

# /impl

Pi の `impl.default` ロール（人間向けラベルはカタログの `label`）で、**隔離された非対話 Pi 子プロセス**に実装まで投げるスキル。呼び出し元エージェント（Claude / Codex / Pi 等）が「正確な実装プロンプト」を作って渡し、実装後に呼び出し元が検証する。

- Pi 上: `/skill:impl`
- その他ホスト: `/impl`

## 基本方針

**非自明な実装は積極的に impl に委譲する。** 呼び出し元は touchpoint の地図化・プロンプト作成・検証に専念し、コード編集は隔離 Pi 実装エージェントに任せる（数行の自明な編集だけ直接可。迷ったら委譲）。

## 役割分担

- **呼び出し元**: 要件整理・調査（触る箇所マップ）・実装プロンプト作成・実装後の検証（lint / 型 / test / 仕様 / cccc）
- **隔離 Pi 実装エージェント**: 実際のコード編集（read / bash / edit / write）。委譲完了時は変更した cccc 対応ファイルに対し `check_complexity.sh` を実行し、**hard 違反なく exit 0** であること

実装側が一番こけるのは「どこを直すべきか自力で全部見つける」部分。先に touchpoint を地図化して渡す。

## 実行手順

1. **要件整理 + 確定仕様の確認**
2. **触る箇所の調査**: 参照テンプレ・ exhaustive map / switch 漏れを列挙。**既存 cccc 対応ファイルは委譲前に** `check_complexity.sh` **で baseline**（新規は baseline なし）
3. **実装プロンプト作成**（確定仕様、触る箇所 file:行、参照テンプレ、完了条件 lint/test/型、触ってはいけない箇所、**プロジェクト規約** — 子 Pi は `--no-context-files` のため親プロンプトに明記）
4. **実行**（バックグラウンド推奨、ログは `/tmp` 等に分離）:

```bash
bash "$HOME/.agents/skills/impl/scripts/run_impl.sh" \
  --prompt "$TMPDIR/impl-prompt.md" \
  --cwd "$PWD" \
  > "$TMPDIR/impl.log" 2>&1
```

- 既定 role は `impl.default`（`model-roles.json` の `roles["impl.default"].pi`）。別ロールは `--role ROLE`（Pi 向け `.pi` フィールド必須。Cursor 専用 role は不可）
- モデル ID は skill / runner に書かない。変更はカタログの `.pi` のみ（`resolve-model.sh --list` / `resolve-model.sh impl.default` で確認）
- 毎回 **新規** 非対話 Pi（`--no-session --no-skills --no-prompt-templates --no-context-files --no-extensions --no-mcp`）。親の settings / packages / SYSTEM.md / 拡張は読まない
- **隔離はサンドボックスではない**（`--cwd` は作業ルートの指定）。プロンプトで触るファイルを絞る
- OpenAI Codex 系 provider の認証: `pi auth check --provider openai-codex --json`（**資格情報の内容は出力しない**）

5. **呼び出し元による検証**（必須）: diff 目視、lint、test、型（プロジェクトで型がある場合）、仕様充足、**cccc**（下記）。子の cccc 結果を鵜呑みにせず、呼び出し元が同じ対象ファイルで **独立に再実行** する
6. 問題があれば軽微は呼び出し元が修正、大きければ追加プロンプトで再委譲（同一未達事項は **最大 2 回** まで再試行し、それでも未達なら報告してユーザーに確認）
7. 一時プロンプトは push 前に削除

## 並行化

独立作業は **ファイル集合が disjoint** なバッチに分割し、**別プロセス・別ログ**で起動する（同一 working copy 上で競合しないファイルだけを各バッチに割当）。

- 共有グルーコード（union 型・登録 index 等）は呼び出し元が書き、実装エージェントには閉じた編集だけ渡す
- ホストがサポートする **バックグラウンド実行**（Cursor / Pi / Claude 等の並行 Bash や job 機構）を使う
- ログ例: `$TMPDIR/impl-1.log`, `$TMPDIR/impl-2.log`

## 複雑度チェック（cccc）— 受け入れ必須

```bash
bash "$HOME/.agents/skills/impl/scripts/check_complexity.sh" path/to/changed.ts
```

- 変更した **cccc 対応の通常ソースのみ**明示列挙（リポジトリ全体・自動 diff 列挙は使わない）
- **警告閾値**: 認知 **> 10**、循環 **> 8**（10 / 8 は許容。hard 上限の 15 / 10 ちょうども hard 違反ではない）
- **exit 0**: 計測でき、hard 違反なし（WARNING のみは許容）
- **exit 1**: hard 違反（認知 **> 15**、循環 **> 10**）— **受け入れ不可**
- **exit 2 / `UNVERIFIED`**: 未検証 — **合格にしない**（`UNVERIFIED` を pass 扱いしない）
- 複数ファイルの集約優先度: **exit 2 > exit 1 > exit 0**
- **baseline**: 既存ファイルは実装前後で比較するが **免除にならない**（悪化・新規 hard は不可）
- **hard 違反時**: 事前合意した変更スコープ内で挙動を保ちつつリファクタして再計測。触ってはいけない箇所（forbidden scope）が優先 — 衝突時は範囲を広げず未達として報告しユーザーに確認（既存違反の事前存在を免除理由にしない）
- **WARNING のみ**残す場合: 可読性のための簡素化に限定し、理由を記録（メトリクス回避の過度な分割はしない）
- Bash / Fish 等 cccc 非対応は ShellCheck・shfmt・Bats（`claude/rules/testing.md`）

## モデル

- 既定 role: **`impl.default`**（表示名はカタログ `label`、例: GPT-6 Luna High）
- 確認: `"$HOME/.pi/agent/resolve-model.sh" impl.default`（または `run_impl.sh --role impl.default` が解決する `.pi` 値）
- 変更: `pi/agent/model-roles.json` の該当 role `.pi` のみ（skills / runner は不変）

## 互換

- 非推奨 alias: `cursor-impl`（`/skill:cursor-impl`）— 中身は本スキルと同じ方針。新規は `/impl` を使う
