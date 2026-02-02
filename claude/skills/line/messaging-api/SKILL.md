---
name: line:messaging-api
description: LINE Messaging API documentation assistant
metadata:
  target_agent: claude
---

# LINE Messaging API Skill

This skill provides access to LINE Messaging API documentation.

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

- **Webhook** - イベント受信設定
- **メッセージ送信** - reply, push, multicast, broadcast
- **リッチメニュー** - カスタムメニュー管理
- **ユーザー情報** - プロフィール取得
- **チャネルアクセストークン** - 認証管理

## Response Format

```
[Answer based on documentation]

**Source:** [source_url]
**Fetched:** [fetched_at]
```
