# Tips & トラブルシューティング

## よくある問題と解決方法

### 1. 補完が効かない場合
- `:LspInfo` でLSPの状態を確認
- `:LspRestart` でLSPを再起動

### 2. キーマップが効かない場合
- `:verbose map <キー>` で現在のマッピングを確認
- 他のプラグインとの競合を確認

### 3. Fernが開かない場合
- プラグインが正しくロードされているか確認
- `:checkhealth` で依存関係を確認

## パフォーマンス最適化

- 大きなファイルでは `WW` (nowrap) で折り返しを無効化
- 不要なLSPは設定で無効化
- dduの検索は対象を絞って使用

## カスタマイズのヒント

- Leader キーは Space に設定（変更可能）
- astarte配列用の設定は init.lua で調整可能
- プラグイン設定は nvim/plugins/ ディレクトリで管理
- dpp.vim設定は TypeScript で記述（nvim/dpp/）