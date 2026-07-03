---
name: parallel-review
description: 並行コードレビューを実行。「レビューして」と言われたらまずこれを使う。Claude Code上では Cursor + Codex、または Cursor + Fugu を使う。単体レビューは cursor-review/codex-review/claude-review/fugu-review を使う。
metadata:
  target_agent: claude
---

# /parallel-review

Claude Code 上で、2つの外部レビュアーを並行実行して結果を統合するスキル。

**ユーザーが「レビューして」と言ったら、単体レビューを明示しない限りまずこの並行レビューを使う。**

## コマンド

- `/parallel-review [レビュー対象・観点]` - 並行コードレビュー

## Claude Code 上での組み合わせ

- デフォルト: **Cursor + Codex**
- ユーザーが `fugu` / `Fugu Ultra` / `Sakana` を明示した場合: **Cursor + Fugu**
- Claude 自身は呼ばない。Claude レビュー単体が必要な場合は `/claude-review` を使う。

## 実行手順

1. レビュー対象・観点・組み合わせを決める。
   - 指定がなければ現在の作業ツリー差分を対象にする。
   - 組み合わせ指定がなければ Cursor + Codex にする。
2. 同じレビュー用プロンプトを2つ作る。
   - 「修正しない」「レビューだけ」「重大度順」「ファイル/行/理由/修正案」を明記する。
   - `.jj` があれば jj 前提で差分確認するよう明記する。
   - 秘密 env ファイルを読まないよう明記する。
3. 以下を**並行**で実行する。

Cursor:

```bash
cursor-agent -p --trust --mode ask --model composer-2.5 --output-format text "レビュー用プロンプト"
```

Codex:

```bash
codex exec -s read-only --ephemeral --skip-git-repo-check "レビュー用プロンプト" < /dev/null
```

Fugu:

```bash
codex exec -p fugu -m fugu-ultra -s read-only --ephemeral --skip-git-repo-check "レビュー用プロンプト" < /dev/null
```

4. 両方の結果を統合して報告する。
   - 両者が一致する指摘 → 高確度として扱う。
   - 片方のみの指摘 → 事実確認できたものだけ採用し、補足として扱う。
   - 矛盾する指摘 → 両方の見解を併記し、現在の agent が確認できた事実を添える。

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

- レビュー出力をそのまま貼らず、現在の agent が要点を再整理する。
- レビュー指摘は `Critical` / `High` / `Medium` / `Low` / `Nit` に分類する。
- 「対応必須」と「任意改善」を分ける。
- 採用しない指摘は、必要に応じて「確認したが不採用」として短く理由を書く。

## 関連スキル（単体レビューはユーザーが明示したときだけ）

- `/cursor-review` - Cursor 単体レビュー
- `/codex-review` - Codex 単体レビュー
- `/claude-review` - Claude 単体レビュー
- `/fugu-review` - Fugu Ultra 単体レビュー
