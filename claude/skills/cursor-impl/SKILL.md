---
name: cursor-impl
description: Cursor Agent CLI (Composer 2.5) に実装まで委譲する
metadata:
  target_agent: claude
---

# /cursor-impl

Composer 2.5 に実装まで投げるスキル。Claude が「正確な実装プロンプト」を作って渡し、実装後に Claude 自身が検証する。

## 基本方針

**実装は積極的に cursor-impl に委譲する。Claude が直接書くより速いため、これをデフォルトにする。**
Claude は「touchpoint の地図化・プロンプト作成・検証」に専念し、コード編集は Composer に任せる。
（ほんの数行で済む自明な編集だけは直接書いてよいが、迷ったら委譲する。）

## コマンド

- `/cursor-impl [実装指示]` - 実装委譲

## 役割分担

- **Claude**: 要件整理・コードベース調査（触る箇所マップ）・実装プロンプト作成・実装後の検証
- **Composer 2.5**: 実際のコード編集（write / shell 込み）

Composer が一番こけるのは「どこを直すべきか自力で全部見つける」部分。Claude が先に touchpoint を地図化して渡すと事故が激減する。

## 実行手順

1. **要件整理 + 確定仕様の確認**: 曖昧な設計判断はユーザーに確認してから渡す（後から手戻りが大きい）
2. **触る箇所の調査**: 参照テンプレ（既存の似た実装）を特定し、全タッチポイントを洗い出す。特に網羅 switch / exhaustive map（`satisfies Record<...>` 等）の漏れはコンパイルエラーや実行時バグになるので全部リストする
3. **実装プロンプト作成**: 以下を必ず明記する
   - 確定仕様（厳守事項）
   - 触る箇所（file:行 + 何をするか）
   - 参照テンプレファイル
   - 完了条件（lint / test コマンドと期待結果）
   - 触ってはいけない箇所
   - プロンプトはファイル化して渡すと長文でも安全（例: `$TMPDIR/impl-prompt.md`）
4. **実行**（write / shell 込み・バックグラウンド推奨）:
   ```bash
   cursor-agent -p --force --trust --model composer-2.5 --output-format text "$(cat $TMPDIR/impl-prompt.md)" > "$TMPDIR/composer.log" 2>&1
   ```
   - `--print text` モードは完了時にまとめて出力するため途中ログは空。完了通知で再開する
5. **Claude による検証**（必須）:
   - `jj diff --summary` / `git diff --stat` で全変更ファイルを目視（意図しないファイル混入・一時ファイルの確認）
   - lint（プロジェクト規約に従う。例: `cld ts lint`）
   - test（関連テスト）
   - 確定仕様の充足チェック
6. **問題があれば**: 軽微なら Claude が直接修正、大きければ追加プロンプトで Composer に再投げ
7. プロンプト用の一時ファイルは push 前に削除する

## 並行化（複数 Composer を同時に走らせる）

独立した作業が複数あるなら積極的に並行化する。方式は**ファイル分割**一本でよい（同一 working copy 上で、各 Composer に競合しないファイル集合を割り当てる）。VCS 非依存で jj / git どちらでも動く。

### 分割の原則

- **縦スライス（独立サブ機能）で割る**。レイヤー（型／API／UI）で割ると同じ共有ファイルを取り合って競合する
- **共有グルーコード（union 型・登録 index・constants map・exhaustive switch 等）は Claude 自身が書く**。Composer には独立した新規ファイルや閉じた編集だけを任せる → 競合ゼロにできる
- Claude の touchpoint 地図を「重複しないファイル集合」N 個に分割し、各 Composer には**自分のバッチのファイルだけ**を渡す
- 同じファイルを複数 Composer が触らざるを得ないなら、それは分割し直すか直列化するサイン（並行しても結局マージで詰まる）

### 手順

1. touchpoint を disjoint なバッチに分割（共有ファイルは除外して Claude 担当に回す）
2. 各バッチを**それぞれ別の Bash 呼び出し（`run_in_background: true`）で起動**する。1 つの Bash に複数行で書くと順次実行になり並行にならないので注意。1 メッセージ内で複数の background Bash を同時に発行する:
   ```bash
   # 別々の background Bash として 1 つずつ起動（ログも分ける）
   cursor-agent -p --force --trust --model composer-2.5 "$(cat $TMPDIR/impl-1.md)" > "$TMPDIR/composer-1.log" 2>&1
   ```
   ```bash
   cursor-agent -p --force --trust --model composer-2.5 "$(cat $TMPDIR/impl-2.md)" > "$TMPDIR/composer-2.log" 2>&1
   ```
3. 各 background の完了通知を待って集約 → Claude が共有グルーコードを書く → 統合して lint/test

### 実務の目安

- 同時数は 2〜4 程度から（API レート / マシン負荷を見て調整）
- ログは必ず Composer ごとに分ける（`$TMPDIR/composer-N.log`）
- 分割が難しい密結合の小変更は、無理に並行化せず単発で回す方が速い

## 注意

- `-p --force` は write / shell を許可する（`--yolo` 相当）。read-only ではない
- バックエンド変更・コード生成（proto等）が不要なら、その旨をプロンプトで明示して暴走を防ぐ
- 変更範囲を限定したい場合はディレクトリを明示する

## モデル

`composer-2.5`（Composer 2.5）。高速・コーディング特化で横展開（パターン追従）作業に強い。
変更したい場合は `cursor-agent --list-models` で一覧確認。
