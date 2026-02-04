---
name: line:mini-app
description: LINE Mini App API documentation assistant
metadata:
  target_agent: claude
---

# LINE Mini App Skill

This skill provides access to LINE Mini App API documentation.

## Documentation

All documentation files are in the `references/` directory as Markdown files.

## Search Tool

```bash
# Run the search script (use python or python3)
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

## Common Topics

- **サービスメッセージ** - notificationToken発行、メッセージ送信
- **共通プロフィール** - Quick Fill API, liff.$commonProfile
- **テンプレート** - templateName, BCP 47言語タグ
- **フォーム自動入力** - data-liff-autocomplete属性

## Response Format

```
[Answer based on documentation]

**Source:** [source_url]
**Fetched:** [fetched_at]
```
