---
name: line:liff
description: LIFF (LINE Front-end Framework) API documentation assistant
metadata:
  target_agent: claude
---

# LIFF Skill

This skill provides access to LIFF (LINE Front-end Framework) API documentation.

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

- **初期化** - liff.init, liff.ready
- **認証** - login, logout, getAccessToken, getIDToken
- **プロフィール** - getProfile, getFriendship
- **メッセージ** - sendMessages, shareTargetPicker
- **動作環境** - getOS, isInClient, getContext
- **ウィンドウ** - openWindow, closeWindow
- **カメラ** - scanCodeV2, scanCode
- **パーマネントリンク** - permanentLink.createUrlBy

## Response Format

```
[Answer based on documentation]

**Source:** [source_url]
**Fetched:** [fetched_at]
```
