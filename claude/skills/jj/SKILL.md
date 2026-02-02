---
name: jj
description: jujutsu (jj) documentation assistant
metadata:
  target_agent: claude
---

# jj Skill

jujutsu (jj) のドキュメントを提供するスキルです。

## Commands

- `/jj <query>` - ドキュメント検索
- `/jj 更新` - ドキュメント更新（site2skill使用）

When user says "更新", run update_docs.py:
```bash
python scripts/update_docs.py
```

Requirements: uv (uvx)

## Documentation

All documentation files are in the `references/` directory as Markdown files.

## Search Tool

```bash
python scripts/search_docs.py "<query>"
```

Options:
- `--json` - Output as JSON
- `--max-results N` - Limit results (default: 10)

## Usage

1. Search or read files in `references/` for relevant information
2. Each file has frontmatter with `source_url` and `fetched_at`
3. Always cite the source URL in responses
4. Note the fetch date - documentation may have changed

## Response Format

```
[Answer based on documentation]

**Source:** [source_url]
**Fetched:** [fetched_at]
```
