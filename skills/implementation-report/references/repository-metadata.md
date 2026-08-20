# Repository metadata（main agent のみ）

Contract:
[../../review-report/references/report-format.md](../../review-report/references/report-format.md)
の `repository`。

## 収集タイミング

Stage 0 の隔離出力 **後**（または入力から完全に切り離す）。subagent / LLM
には依頼しない。**Stage 0 は repository metadata を受け取らない**。

## スクリプト

```bash
deno run --allow-read --allow-write --allow-run \
  skills/implementation-report/scripts/collect_repository_metadata.ts \
  --repo ROOT -o repository.json
```

- jj: `jj file list` + `jj diff` の path/status
- git fallback: `git ls-files` + `git diff --name-status`
- 出力は `{ name, trackedFiles, changes[] }`。path/status のみ。内容は含めない
- `repository` は `reportId` 生成に含めない（tree 更新で localStorage key を変えない）
- secret path は `isSecretPath` で除外する。rename は `previousPath` を付ける
- 収集失敗は非 0

## 新規レポート

VCS metadata 収集が成功したら `repository` を **必ず** report.json に含める。
通常の新規生成で `repository` を省略してはいけない。

```bash
deno run --allow-read --allow-write \
  skills/implementation-report/scripts/assemble_report.ts \
  --stage0 result.json \
  --repository repository.json \
  -o report.json
```

## 収集失敗時のみ degraded fallback

決定論的収集ができない場合のみ `repository` を省略してよい。そのときは
**ユーザーへ理由を明示** し、Repository Map が非表示になることを伝える。
**理由を伝えずに黙って省略してはいけない**。

```bash
deno run --allow-read --allow-write \
  skills/implementation-report/scripts/assemble_report.ts \
  --stage0 result.json \
  --omit-repository \
  -o report.json
```

`repository` フィールド自体は contract 上 optional（legacy JSON の render
互換）。省略は legacy / degraded fallback のみを意味する。
