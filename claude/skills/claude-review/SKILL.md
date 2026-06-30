---
name: claude-review
description: Claude Code CLIでコードレビューを実行。Use when the user asks for a Claude-based review, Claude review skill, code review with Claude, PR/diff review by Claude, or wants a second-pass review separate from the current agent. Runs headless Claude in read-only/ask mode and reports findings in Japanese.
metadata:
  target_agent: claude
---

# /claude-review

Claude Code CLI を headless で起動し、現在の変更・PR・指定範囲をレビューするスキル。

## コマンド

- `/claude-review [レビュー対象・観点]` - Claude によるコードレビュー

## 実行手順

1. レビュー対象を決める。
   - 指定があればそれを使う（PR番号/URL、ファイル、差分範囲、観点）。
   - 指定がなければ現在の作業ツリー差分を対象にする。
2. レビュー用プロンプトを作る。
   - 「修正しない」「レビューだけ」「重大度順」「ファイル/行/理由/修正案」を明記する。
   - `.jj` があれば jj 前提で差分確認するよう明記する。
3. Bash で Claude Code CLI を headless 実行する。

```bash
# plan モード = 読み取り専用調査。編集・書き込みは構造的に不可
claude -p --permission-mode plan --model opus --effort high --no-session-persistence "レビュー用プロンプト"
```

   - `claude` は cwd の repo を自分で読む。差分対象は「`jj diff`（`.jj` 無ければ `git diff`）を確認してレビューせよ」とプロンプトで指示する。
   - PR を対象にする場合は「`gh pr diff <番号>` を確認せよ」と指示する。

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

## 出力統合ルール

- Claude の出力をそのまま貼らず、現在の agent が要点を再整理する。
- レビュー指摘は `Critical` / `High` / `Medium` / `Low` / `Nit` に分類する。
- 「対応必須」と「任意改善」を分ける。
- 既存の `/fugu` / `/cursor` と併用した場合は、一致した指摘を高確度として扱う。

## 注意

- このスキルはレビュー専用。実装修正はユーザーが依頼した場合だけ行う。
- Claude CLI はカレントリポジトリの設定・hooks を読むため、破壊的操作は既存 hooks に従う。
- `--permission-mode plan` を使う。`-p`（非対話）では承認プロンプトが出せないため、`default` だと必要な読み取りコマンドまで無確認で拒否されレビューが空振りする。`plan` なら編集不可のまま調査系コマンドを実行できる。
