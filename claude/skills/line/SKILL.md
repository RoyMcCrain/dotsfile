---
name: line
description: LINE Platform API documentation (LIFF, Messaging API, LINE Login)
metadata:
  target_agent: claude
---

# LINE Skill

LINE Platform APIのドキュメントを提供するスキルです。

## Commands

- `/line <query>` - ドキュメント検索
- `/line 更新` - 全ドキュメント更新
- `/line 更新 liff` - LIFF のみ更新
- `/line 更新 messaging` - Messaging API のみ更新
- `/line 更新 login` - LINE Login のみ更新

When user says "更新", run update_docs.py:
```bash
python scripts/update_docs.py           # 全更新
python scripts/update_docs.py --liff    # LIFF のみ
python scripts/update_docs.py --messaging  # Messaging API のみ
python scripts/update_docs.py --login   # LINE Login のみ
```

## Documentation

- `liff/references/` - LIFF (LINE Front-end Framework) API
- `messaging-api/references/` - LINE Messaging API
- `line-login/references/` - LINE Login v2.1 API

## Search Tool

```bash
# LIFF APIを検索
python scripts/search_all.py "<query>"

# 個別検索
python liff/scripts/search_docs.py "<query>"
python messaging-api/scripts/search_docs.py "<query>"
python line-login/scripts/search_docs.py "<query>"
```

Options:
- `--json` - Output as JSON
- `--max-results N` - Limit results (default: 10)

## Update Docs

```bash
# 全ドキュメント更新
python scripts/update_docs.py

# 個別更新
python scripts/update_docs.py --liff
python scripts/update_docs.py --messaging
python scripts/update_docs.py --login
```

Requirements: curl

## Common Topics

### LIFF
- **初期化** - liff.init, liff.ready
- **認証** - login, logout, getAccessToken
- **メッセージ** - sendMessages, shareTargetPicker
- **動作環境** - getOS, isInClient, getContext

### Messaging API
- **Webhook** - イベント受信設定
- **メッセージ送信** - reply, push, multicast, broadcast
- **リッチメニュー** - カスタムメニュー管理
- **Flex Message** - カスタマイズ可能なメッセージ

### LINE Login
- **OAuth** - Issue/verify/refresh/revoke access token
- **IDトークン** - JWT verification, claims
- **ユーザー情報** - userinfo, profile
- **友だち確認** - friendship status

## Response Format

```
[Answer based on documentation]

**Source:** [source_url]
**Fetched:** [fetched_at]
```
