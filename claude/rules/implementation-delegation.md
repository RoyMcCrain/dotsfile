# Implementation Delegation Rule

## 基本方針

実装委譲は **`impl` スキル**（Pi role **`impl.default`**）を使う。既定は Claude Haiku / Luna の観測残量が多い側を選ぶ（OpenAI は Codex の参考値）。同率・両側不明時のみ交互選択し、両側 0% なら停止する。**非自明な実装は積極的に委譲**し、呼び出し元が正確な指示を作り、実装後に検証する。詳しい選択規則は `skills/impl/SKILL.md` を参照する。

モデル ID は直書きせず role で指定する。実体は `~/.pi/agent/model-roles.json`（`~/.pi/agent/resolve-model.sh --list`）。`impl.haiku` / `impl.luna` など具体的な role の固定指定では残量を照会しない。直接 resolver `impl.default` は互換性のため Luna を返す。

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
- 実装後は必ず呼び出し元が検証（テスト方針は `~/.pi/agent/APPEND_SYSTEM.md`、cccc 手順・受け入れ基準は `~/.agents/skills/impl/SKILL.md`）
- 非推奨 `/cursor-impl` は `impl` と同じ正本（`skills/impl/SKILL.md`）に従う
