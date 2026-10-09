# Implementation Delegation Rule

## 基本方針

実装委譲は **`impl` スキル**（Pi role **`impl.default`**、既定 GPT-6 Luna High）を使う。**非自明な実装は積極的に委譲**し、呼び出し元（Claude 等）が「正確な指示」を作って渡し、実装後の検証は呼び出し元が行う。

モデル ID は直書きせず role で指定する。実体は `~/.pi/agent/model-roles.json`（`~/.pi/agent/resolve-model.sh --list`）。Pi 実装 role は `resolve-model.sh impl.default` または `run_impl.sh --role …` で解決する。

## 委譲する

- 実装作業（隔離 Pi 子プロセス、`read,bash,edit,write`）

## 呼び出し元が自分でやる

- 要件整理・探索・touchpoint マップ
- 実装委譲用プロンプト作成（プロジェクト規約を明記 — 子 Pi は自動コンテキスト無し）
- 実装後の検証（diff・lint・test・仕様・cccc）と軽微な手直し
- コードレビュー（`parallel-review` 等）

## 委譲方法

- `/impl [実装指示]` または Pi `/skill:impl`
- 実行: `bash "$HOME/.agents/skills/impl/scripts/run_impl.sh" --prompt PATH [--cwd PATH] [--role ROLE]`

## 原則

- touchpoint を先に地図化し、確定仕様・触る箇所・完了条件を明記してから渡す
- 実装後は必ず呼び出し元が検証（cccc 含む — `claude/rules/testing.md` と `impl` スキル）
- 非推奨 `/cursor-impl` は `impl` と同じ正本（`skills/impl/SKILL.md`）に従う
