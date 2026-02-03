---
name: line:line-login
description: LINE Login v2.1 API documentation assistant
metadata:
  target_agent: claude
---

# LINE Login Skill

This skill provides access to LINE Login v2.1 API documentation.

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

- **OAuth** - Issue/verify/refresh/revoke access token
- **認証** - authorization_code, PKCE (code_verifier)
- **IDトークン** - JWT verification, claims (sub, name, picture, email)
- **ユーザー情報** - userinfo endpoint, profile scope
- **友だち確認** - friendship status with official account
- **アプリ連携解除** - deauthorize endpoint

## Response Format

```
[Answer based on documentation]

**Source:** [source_url]
**Fetched:** [fetched_at]
```
