---
name: crm-postmortem
description: CRMプロジェクト（zero-color.atlassian.net）のConfluence「Postmortem」スペース配下にインシデント報告書ページをdraftで作成するスキル。ユーザーが「ポストモーテム作成」「インシデント報告書を書きたい」「create postmortem」「障害振り返り」のようにインシデントの記録・Confluenceでの報告書作成を求めた際に必ず使用する。Confluenceの既存テンプレートに沿って、事象・影響範囲・タイムライン・原因・対応策・アクションアイテムをADF形式でステータスマクロ（色付きバッジ）付きで構成する。プロジェクト固有のcloudId/parentId/色マッピングを全て内包しているので、ユーザーは事象情報だけ渡せばよい。
---

# CRM Postmortem Skill

zero-color CRM プロジェクト専用の Confluence Postmortem 自動作成スキル。
インシデントの事後報告を、既存テンプレートと既存Postmortemに準拠した ADF 形式の draft ページとして書き出す。

## いつ使うか

ユーザーが以下のような依頼をしたとき:

- 「ポストモーテム作成」「ポストモーテムを書いて」
- 「インシデント報告書」「障害報告書」「振り返りドキュメント」
- 「Confluence にインシデントまとめたい」
- 「create postmortem」「write incident report」

会話の文脈に既にインシデント情報が揃っている場合は、それを材料にして直接ページを構築する（無駄な聞き返しをしない）。足りない項目だけユーザーに確認する。

## プロジェクト固有の定数

これらは **常に固定値**。ユーザーに聞かない:

| 項目 | 値 |
|:---|:---|
| `cloudId` | `zero-color.atlassian.net` |
| Postmortem 親ページ ID | `138543106` |
| Template ページ ID | `138543120` |
| Space ID | `65706` |

## 絶対ルール

1. **必ず `status: "draft"` で作成する**。勝手に公開しない（`current` で作らない）。ユーザーがレビュー後に手動で公開する。
2. **必ず `contentFormat: "adf"` を使う**。markdown だとステータスマクロが色付きバッジにならず plain text で出てしまう（既知の失敗パターン）。
3. **タイトルは `YYYY-MM-DD 短い事象タイトル`** の形式。既存の兄弟ページと同じ命名規則を踏襲する。日付は事象発生日（JST）。
4. **作成後は draft URL をユーザーに返し、公開は任せる**。自分で publish/update status しない。

## 手順

### Step 1: 既存兄弟ページを確認（重複防止 & 命名参考）

`mcp__plugin_atlassian_atlassian__getConfluencePageDescendants` で親 `138543106` の子ページ一覧を取得し、:

- 同じ日付・同じ事象のページが既にないか
- 命名規則が揃っているか

を確認。既存例:

```
2025-10-29 nana lingerieでID連携が出来ない不具合
2026-02-16 ClickHouseの認証エラー
2026-04-08 リッチメニューのメッセージアクション変更に伴う不具合
```

必要なら既存ページ（例: `207814657`）を `contentFormat: "adf"` で取得して、ADF ノード構造・色・テーブル幅などを確認する。

### Step 2: 情報収集

不足している情報をユーザーに確認する。以下のセクションが埋められる材料があれば OK:

- **事象**: 一文での要約 + 何が起きたか
- **影響範囲**:
  - 数値（配信通数・影響ユーザー数・対象テナント）
  - 潜在的な影響範囲（該当コードパスがどこまで波及するか）
- **タイムライン**: STARTED / IDENTIFIED / MITIGATED / CLOSED の遷移時刻
- **原因**: 該当コード、ロジック、なぜ検知できなかったか
- **対応策**: 障害復旧 + 恒久対応
- **アクションアイテム**: 種別（PREVENT/IDENTIFY/MITIGATE）+ PR/Jira リンク

### Step 3: ADF で draft 作成

`mcp__plugin_atlassian_atlassian__createConfluencePage` を以下の引数で呼ぶ:

```
cloudId: "zero-color.atlassian.net"
spaceId: "65706"
parentId: "138543106"
status: "draft"
contentFormat: "adf"
title: "YYYY-MM-DD 短い事象タイトル"
body: <ADF JSON>
```

### Step 4: draft URL を返す

レスポンスの `_links.webui` or `edituiv2` をユーザーに返す:

```
https://zero-color.atlassian.net/wiki/pages/resumedraft.action?draftId={pageId}
```

「draft のまま残してあります。内容確認して OK なら Confluence 画面の『公開』ボタンで公開してください。編集したい箇所があればこちらでも直せます。」とガイド。

## ADF 組み立てガイド

### ステータスマクロの色（既存 Postmortem から固定）

| ラベル | color | 用途 |
|:---|:---|:---|
| `STARTED` | `red` | インシデント発生 |
| `IDENTIFIED` | `yellow` | 原因特定 |
| `MITIGATED` | `blue` | 一時対応完了 |
| `CLOSED` | `green` | 完全クローズ |
| `PREVENT` | `green` | 再発防止アクション |
| `IDENTIFY` | `yellow` | 検知改善アクション |
| `MITIGATE` | `blue` | 影響軽減アクション |

ADF ノード:

```json
{
  "type": "status",
  "attrs": {"text": "STARTED", "color": "red", "style": "bold"}
}
```

### 必須セクション構成（テンプレ準拠）

```
## 事象
(一段落で何が起きたか)
(対象テナント・対象リソース等の箇条書き)

## 影響範囲
### 今回の影響
(数値表)
### 潜在的な影響範囲
(コードパス等の広がり)

## タイムライン
(凡例: STARTED IDENTIFIED MITIGATED CLOSED のステータス並び)
(タイムライン表: 日時/ステータス列 + 事象列)
(注釈 blockquote があれば)

## 原因
(原因の説明)
(関連コードの抜粋: codeBlock)
(なぜ検知できなかったか: 発見のきっかけ, テストカバレッジ不足)

## 対応策
### 障害復旧
### 恒久対応
(PREVENT / IDENTIFY / MITIGATE 凡例)
(具体的な対応一覧)

## アクションアイテム
(PREVENT / IDENTIFY / MITIGATE 凡例)
(表: アイテム | タイプ | Jiraチケット / PR)
```

### よく使う ADF パターン

**タイムラインの凡例パラグラフ**:

```json
{
  "type": "paragraph",
  "content": [
    {"type": "status", "attrs": {"text": "STARTED", "color": "red", "style": "bold"}},
    {"type": "text", "text": " "},
    {"type": "status", "attrs": {"text": "IDENTIFIED", "color": "yellow", "style": "bold"}},
    {"type": "text", "text": " "},
    {"type": "status", "attrs": {"text": "MITIGATED", "color": "blue", "style": "bold"}},
    {"type": "text", "text": " "},
    {"type": "status", "attrs": {"text": "CLOSED", "color": "green", "style": "bold"}}
  ]
}
```

**タイムライン表のステータス遷移行**（日時列にステータスマクロを並べる）:

```json
{
  "type": "tableCell",
  "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "2026-04-22 12:03 JST"}]},
    {"type": "paragraph", "content": [{"type": "status", "attrs": {"text": "IDENTIFIED", "color": "yellow", "style": "bold"}}]}
  ]
}
```

**PR/Jira リンク**: `inlineCard` を使う（`text + link` marks より見た目がリッチ）

```json
{"type": "inlineCard", "attrs": {"url": "https://github.com/zero-color/crm/pull/2069"}}
```

**コード識別子**（関数名・ファイルパス・SQL 句など）: `code` mark

```json
{"type": "text", "text": "joinSQL", "marks": [{"type": "code"}]}
```

**コードブロック**（抜粋・スタックトレース）:

```json
{
  "type": "codeBlock",
  "attrs": {"language": "go"},
  "content": [{"type": "text", "text": "func joinSQL(parts []string, sep string) string {\n    // ...\n}"}]
}
```

**注釈の blockquote**:

```json
{
  "type": "blockquote",
  "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "注: ..."}]}
  ]
}
```

## アンチパターン（やらないこと）

- ❌ markdown 形式で書く → ステータスマクロが plain text になり読みにくい
- ❌ `<custom data-type="status" ...>` を markdown に埋めて解決しようとする → storage 形式に変換されないため NG
- ❌ `status: "current"` で作る → 勝手に公開してしまい notification が飛ぶ
- ❌ `parentId` を指定せず作る → Postmortem 親配下に入らない
- ❌ タイトルに日付を入れ忘れる → 一覧で時系列が壊れる
- ❌ 「だいたいの数値」で書き飛ばす → Postmortem はデータの正確さが信頼性の中核

## レファレンス: 既存 Postmortem サンプル ID

参考にする際は `contentFormat: "adf"` で取得して構造を真似る:

- `138543120` Template（空テンプレート）
- `207814657` 2026-04-08 リッチメニューのメッセージアクション変更に伴う不具合（充実した例）
- `186023937` 2026-02-16 ClickHouseの認証エラー
- `138543113` 2025-10-29 nana lingerieでID連携が出来ない不具合

特に `207814657` はテーブル・ステータス・inlineCard・mention・codeBlock がひと通り揃っているので、不明な ADF ノードが出たときはまずこれを見る。
