---
name: obsidian-inbox
description: Obsidian Vault の Inbox に Obsidian Tasks 形式のタスクを1行追記する。ユーザーが「Obsidian の Inbox に追加して」「これをタスクとしてメモして」「明日までのタスクを Inbox に入れて」など、Inbox への記録を明示したときに使う。相談や候補提示だけでは書き込まない。
---

# Obsidian Inbox

ユーザーの Obsidian Vault Inbox へ、Obsidian Tasks 記法のタスクを **1行** 安全に追記する。ローカルファイルを変更するため、**Inbox への記録を明示した依頼がある場合だけ** 実行する。

## いつ発動するか

- 「Obsidian の Inbox に追加して」
- 「これをタスクとしてメモして」
- 「明日までのタスクを Inbox に入れて」

次の場合は **書き込まない**:

- タスク候補の提案・整理だけ
- 「Inbox に入れた方がいいかも」など記録依頼が曖昧な相談

## 対象ファイル

既定: `$HOME/Documents/Vault/📥 Inbox.md`

環境変数 `OBSIDIAN_INBOX_FILE` で上書き可能。helper の `--file` も使える。

## 日付の解釈（agent 側）

締切の自然言語は **agent が解釈** し、helper には ISO 形式 `YYYY-MM-DD` だけ渡す。

| ユーザー表現 | 解釈 |
|---|---|
| 今日 | 実行時のローカル日付 |
| 明日 | ローカル日付 + 1 日 |
| N日後 | ローカル日付 + N 日 |

**必ず** 実行時のローカル日付を `date` で確認してから絶対日付化する:

```bash
date +%Y-%m-%d
date -v+1d +%Y-%m-%d   # macOS: 明日
date -d tomorrow +%Y-%m-%d  # Linux: 明日
```

**勝手に決めない** 曖昧表現（例: なるはや、今週中、来週くらい）は、ユーザーに日付を確認してから helper を呼ぶ。

## セクション振り分け

| 条件 | セクション |
|---|---|
| 最優先（`--priority`） | `## 🚨 最優先` |
| 最優先なし・期限あり（`--due`） | `## 📅 期限あり` |
| どちらもなし | `## ⏳ 期限なし・あとで` |

## 行フォーマット

- 基本: `- [ ] <本文>`
- 期限のみ: `- [ ] <本文> 📅 YYYY-MM-DD`
- 最優先＋期限: `- [ ] <本文> 📅 YYYY-MM-DD ⏫`
- 最優先のみ: `- [ ] <本文> ⏫`
- URL / Markdown link は **本文側** に置き、Tasks metadata（`📅` `⏫`）は **行末**

## 実行手順

```bash
SCRIPT="$HOME/.agents/skills/obsidian-inbox/scripts/add-task.sh"
# またはリポジトリ内: skills/obsidian-inbox/scripts/add-task.sh

# 期限なし
bash "$SCRIPT" -- "タスク本文"

# 期限あり（YYYY-MM-DD は agent が解決済み）
bash "$SCRIPT" --due 2026-09-04 -- "タスク本文"

# 最優先＋期限
bash "$SCRIPT" --due 2026-09-04 --priority -- "タスク本文"

# ファイル指定
bash "$SCRIPT" --file "$OBSIDIAN_INBOX_FILE" -- "タスク本文"
```

## 完了報告

1. helper の stdout（追加した完全な1行）を確認
2. 対象ファイルの該当行または末尾付近を確認
3. ユーザーへ **追記内容** と **解決済み日付**（あれば）を短く返す

## 注意

- 実 Vault をテスト用途で書き換えない
- 本文に改行を含めない（複数行タスクは不可）
- helper が非0終了したら内容を変えず、エラーをユーザーに伝える
