---
name: cheap-pr
description: PR作成を安価モデル優先で行う。ユーザーが「PRだして」「PR出して」「PR作って」「pull requestを作成」「プルリク作成」など、PRを開く/提出する依頼をしたときに使う。
metadata:
  target_agent: Codex
---

# /cheap-pr

PR作成を、余計な高価モデル呼び出しを避けて実行するスキル。

## モデル方針

- PR作成だけなら、追加の高価モデル（`fugu-ultra` / Opus / Cursor など）へ委譲しない。
- Pi では可能なら `sakana-ai-console/fugu` を使う。
  - `cheap-pr-model.ts` 拡張が有効なら、PR作成依頼時に自動で `fugu` へ切り替わる。
  - 既に高価モデルでターンが始まっている場合は、そのターンでは CLI と既存情報中心で進め、追加の LLM サブタスクを増やさない。
- レビューや長いPR説明生成が必要な場合だけ、ユーザーに確認してから追加モデルを使う。

## 実行手順

1. 状態確認
   - `.jj` がある場合は `git` ではなく `jj` を使う。
   - `jj status` と `jj diff` で差分を確認する。
2. 最小検証
   - 変更内容に応じて軽い検証だけ実行する。
   - 大きなテストや外部レビューは、ユーザーが明示しない限り省く。
3. リビジョン説明
   - `JJ_EDITOR=true jj describe -m "..."` で短い説明を付ける。
4. bookmark
   - ユーザー指定がなければ変更内容から短い bookmark 名を作る。
   - 例: `chore/pi-token-controls`
   - `jj bookmark create <name> -r @` または既存 bookmark なら `jj bookmark set <name> -r @` を使う。
5. push
   - ユーザーがPR作成を明示している場合のみ `jj git push --bookmark <name>` する。
   - force-push は明示依頼がある場合だけ行う。
6. PR作成
   - `gh pr create --base main --head <name> --title "..." --body "..."` を使う。
   - PR本文は簡潔にする。

## PR本文テンプレート

```markdown
## Summary
- ...

## Verification
- ...
```

## 注意

- 秘密 env ファイル（`.env`, `.env.local`, `.env.*.local`, `.envrc.local`）は読まない。
- PR作成は外部送信なので、ユーザーが「PRだして」等で明示したときだけ実行する。
- merge / branch削除 / bookmark削除 / force-push は、ユーザーが明示したときだけ実行する。
