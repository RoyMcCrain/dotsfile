# ClaudeCode - AI支援

## キーマッピング

| キー | 説明 | モード |
|------|------|--------|
| `<C-g>` | Claude Codeのトグル（開く/閉じる） | Normal |
| `<C-g>` | ターミナルモードからClaude Codeをトグル | Terminal |
| `<C-g>` | 選択範囲をClaude Codeに送信 | Visual |

## コマンド

| コマンド | 説明 |
|----------|------|
| `:ClaudeCode` | Claude Codeセッションを開始/トグル |
| `:ClaudeCodeSend` | 現在の選択範囲またはテキストをClaude Codeに送信 |
| `:ClaudeCodeAdd <file>` | 指定したファイルをコンテキストに追加 |
| `:ClaudeCodeAddFile` | 現在開いているファイルをコンテキストに追加 |
| `:ClaudeCodeStop` | Claude Codeセッションを終了 |
| `:ClaudeCodeClear` | 会話履歴とコンテキストをクリア |
| `:ClaudeCodeRestart` | Claude Codeを再起動 |

## 設定内容

### 基本設定
- **auto_start**: `true` - Neovim起動時に自動でClaude Codeを開始
- **log_level**: `info` - ログレベル（debug/info/warn/error）
- **track_selection**: `true` - ビジュアル選択を自動的に追跡

### ターミナル設定
- **split_side**: `right` - ターミナルウィンドウの位置（右側）
- **split_width_percentage**: `0.4` - ターミナル幅（画面の40%）
- **provider**: `auto` - ターミナルプロバイダー（自動選択）
- **auto_close**: `true` - セッション終了時に自動でターミナルを閉じる

## 使用例

### 基本的な使い方
1. `<C-g>` でClaude Codeウィンドウを開く
2. 質問やコードに関する相談を入力
3. `<C-g>` で再度トグルして閉じる

### コンテキスト付き質問
1. ビジュアルモードでコードを選択
2. `<C-g>` で選択範囲をClaude Codeに送信
3. 選択したコードについて質問

### ファイル全体をコンテキストに追加
```vim
:ClaudeCodeAddFile
```
または特定のファイルを追加:
```vim
:ClaudeCodeAdd ~/project/src/main.ts
```

## Tips
- Claude Codeウィンドウは右側に40%の幅で開きます
- ターミナルモードでも `<C-g>` でトグル可能
- セッションは自動保存され、再起動後も履歴が保持されます
- `:ClaudeCodeClear` で会話をリセットできます