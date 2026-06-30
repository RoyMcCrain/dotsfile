---
name: codex-review
description: Codex CLIでコードレビューを実行。Use when the user asks for a Codex-based review, Codex review skill, code review with Codex, PR/diff review by Codex, or wants a second-pass review separate from the current agent. Runs headless Codex in read-only mode and reports findings in Japanese.
metadata:
  target_agent: Codex
---

# /codex-review

Codex CLI を headless/read-only で起動し、現在の変更・PR・指定範囲をレビューするスキル。

## コマンド

- `/codex-review [レビュー対象・観点]` - Codex によるコードレビュー
- Pi で明示実行する場合は `/skill:codex-review [レビュー対象・観点]`

## 実行手順

1. レビュー対象を決める。
   - 指定があればそれを使う（PR番号/URL、ファイル、差分範囲、観点）。
   - 指定がなければ現在の作業ツリー差分を対象にする。
2. レビュー用プロンプトを作る。
   - 「修正しない」「レビューだけ」「重大度順」「ファイル/行/理由/修正案」を明記する。
   - `.jj` があれば jj 前提で差分確認するよう明記する。
   - 秘密 env ファイルを読まないよう明記する。
3. Bash で Codex CLI を headless 実行する。

```bash
codex exec -p fugu -m fugu-ultra -s read-only --skip-git-repo-check --ephemeral "レビュー用プロンプト" < /dev/null
```

   - `-p fugu` は `~/.codex/fugu.config.toml` を読み込むための profile 指定。
   - `-m fugu-ultra` で Fugu Ultra を明示する。
   - `-s read-only` で編集・書き込みを禁止する。
   - `--ephemeral` でレビュー用セッションを保存しない。
   - `--skip-git-repo-check` でリポジトリ外でも動く。
   - `< /dev/null` で stdin 待ちブロックを防ぐ。

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

- Codex の出力をそのまま貼らず、現在の agent が要点を再整理する。
- レビュー指摘は `Critical` / `High` / `Medium` / `Low` / `Nit` に分類する。
- 「対応必須」と「任意改善」を分ける。
- 既存の `/fugu` / `/cursor` と併用した場合は、一致した指摘を高確度として扱う。

## 注意

- このスキルはレビュー専用。実装修正はユーザーが依頼した場合だけ行う。
- `Codex -p --permission-mode ...` は Claude Code 用オプションと混同しやすいので使わない。Codex CLI では `codex exec ... -s read-only` を使う。
