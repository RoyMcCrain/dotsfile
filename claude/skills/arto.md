---
name: arto
description: MarkdownファイルをArtoでプレビュー
metadata:
  target_agent: claude
---

# Arto Skill

MarkdownファイルをArtoでプレビューする。

## Commands

- `/arto <file>` - 指定ファイルをArtoで開く
- `/arto` - 直前に編集した.mdファイルをArtoで開く

When user invokes this skill, run:
```bash
open -a Arto "<file_path>"
```

## Usage

Markdownファイルのプレビュー・リーディングに使用。
