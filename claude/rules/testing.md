# Testing Rule

## 基本方針

t-wada推奨の方法に則って実装する。

- テスト駆動開発（TDD）
- Red → Green → Refactor サイクル
- 小さなステップで進める

## 方針

- パターン: AAA（Arrange-Act-Assert）
- カバレッジ目標: 80%
- モック: 最小限
- 粒度: 統合テスト重視

## AI 生成コードの複雑度（cccc）

実装受け入れ（Pi / Cursor 委譲含む）の**追加シグナル**。lint・型・test・仕様充足の代替ではない。

- **コマンド**（共有スキル）: `bash "$HOME/.agents/skills/cursor-impl/scripts/check_complexity.sh" FILE...` — 変更した **cccc 対応の通常ソースファイルを明示列挙**（リポジトリ全体・自動 diff 列挙は使わない）
- **警告**: 認知 **> 10**、循環 **> 8**（10 / 8 は許容）。WARNING のみなら **exit 0**
- **hard 上限**: 認知 **> 15**、循環 **> 10**（15 / 10 は hard 違反にならない）。超過は `ERROR` 行と **exit 1**（受け入れ不可）
- **`UNVERIFIED` / exit 2**: 未検証（計測不能・パース失敗・非対応言語等）。**受け入れ不可**（合格にしない）。複数ファイルでは集約優先度 **exit 2 > exit 1 > exit 0**
- **baseline**: 既存ファイルは実装前に計測結果を控え、実装後と比較（悪化確認用。免除ではない）。新規ファイルは baseline なしと明記
- **非対応**: Bash / Fish 等は cccc 対象外 → ShellCheck / shfmt / Bats 等。file_count 0 は `UNVERIFIED`（**exit 2**）
- hard 違反は事前合意した変更スコープ内で挙動を保ちつつリファクタして再計測。触ってはいけない箇所を優先し、衝突時は範囲を広げず未達として報告してユーザーに確認（既存違反を免除しない）。WARNING だけ残す場合は可読性のためだけに簡素化（メトリクス回避の過度な分割はしない）し、理由を残す
