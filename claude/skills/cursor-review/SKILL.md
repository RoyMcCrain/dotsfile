---
name: cursor-review
description: Cursor Agent CLIでコードレビューを実行。単体レビュー専用。「レビューして」だけの依頼では parallel-review を優先する。
metadata:
  target_agent: claude
---

# /cursor-review

Cursor Agent CLI (Composer 2.5) を headless/read-only で起動し、現在の変更・PR・指定範囲をレビューするスキル。

## コマンド

- `/cursor-review [レビュー対象・観点]` - Cursor による単体コードレビュー

## 実行手順

1. レビュー対象を決める。
   - 指定があればそれを使う（PR番号/URL、ファイル、差分範囲、観点）。
   - 指定がなければ現在の作業ツリー差分を対象にする。
2. レビュー用プロンプトを作る。
   - 「修正しない」「レビューだけ」「重大度順」「ファイル/行/理由/修正案」を明記する。
   - `.jj` があれば jj 前提で差分確認するよう明記する。
   - 秘密 env ファイルを読まないよう明記する。
3. Bash で Cursor Agent CLI を headless 実行する。

```bash
cursor-agent -p --trust --mode ask --model composer-2.5 --output-format text "レビュー用プロンプト"
```

   - `--mode ask` で read-only の Q&A モードにする。
   - `--trust` は headless 実行で workspace trust prompt を避けるために使う。
   - `--output-format text` で結果を通常テキストとして受け取る。

4. 結果を精査して報告する。
   - 事実確認できる指摘だけ採用する。
   - 不確かな指摘は「要確認」として分ける。
   - 重大な指摘を先に出す。

## 推奨プロンプト

```text
あなたは厳格なコードレビュアーです。以下をレビューしてください。

対象: {対象}
観点: {観点 or バグ、セキュリティ、設計逸脱、テスト不足、回帰リスク}

制約:
- ファイルは編集しない
- コマンド実行は読み取り系だけにする
- `.jj` がある場合は git ではなく jj で状態と差分を確認する
- 秘密envファイル（.env / .env.local / .env.*.local / .envrc.local）は読まない

出力:
- 重大度順
- 各指摘に ファイル/行、問題、理由、修正案 を含める
- 指摘なしなら「重大な問題なし」と明記する
```

## 出力整理ルール

- Cursor の出力をそのまま貼らず、現在の agent が要点を再整理する。
- レビュー指摘は `Critical` / `High` / `Medium` / `Low` / `Nit` に分類する。
- 「対応必須」と「任意改善」を分ける。

## 関連スキル

- `/parallel-review` - 並行レビュー（「レビューして」だけの依頼はこちらを優先）
- `/claude-review` - Claude 単体レビュー
- `/fugu-review` - Fugu Ultra 単体レビュー
- codex-review (Codex CLI/Pi 専用スキル。Claude Code の skill パスには公開されていないため `/codex-review` は呼べない。Codex 単体レビューが必要な場合は `codex exec -p ... -s read-only` を直接実行する)
