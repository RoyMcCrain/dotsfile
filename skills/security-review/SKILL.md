---
name: security-review
description: 通常の parallel-review すべてに共通セキュリティ指示を提供する。明示的なセキュリティ観点の依頼（「セキュリティ観点でレビュー」等）または明示 invocation は parallel-review をセキュリティ専用に絞る。単体 reviewer 指定は既存 routing を優先する。
---

# Security review

通常の parallel-review は correctness・security・回帰・設計・テスト不足を維持し、この skill の共通セキュリティ指示を毎回 supplement として適用する。明示的なセキュリティ専用 invocation だけがレビュー範囲を security に絞る。これは Cloudflare の `security-audit-skill` を参考にしたローカル適応であり、同 skill の完全なインストールではない。完全監査ハーネス、6-phase audit、独立エージェントによる全コードベース監査ではない。

単体 reviewer が明示されている場合は既存の単体 reviewer routing を優先し、この並列 workflow は起動しない。

共通 guidance として読み込まれた場合は、既に進行中の parallel-review の同じ run/prompt に supplement として適用するだけであり、workflow の再起動、新 run、preflight/init 再実行、security-only への暗黙の範囲変更を行わない。明示的なセキュリティレビュー依頼では [parallel-review](../parallel-review/SKILL.md) の workflow を最初から最後まで一度だけ使用し、通常の preflight（秘密検査を含む）、auto または明示 tier 選択、選択された全 reviewer（Muse を含む）、timeout/retry、chunking、履歴・assessment の保存をそのまま適用する。security-review は reviewer を追加せず、tier や provenance schema を変更しない。parallel-review step 8 で [review prompt](references/review-prompt.md) を静的 security supplement として `$REVIEW_DIR/prompt.md` に加える。通常 mode では一般 prompt を補強し、明示専用 mode では一般 prompt の観点だけを security に置き換えて同じ supplement を使う。

- reviewer へ渡す入力ファイルは従来どおり patch/chunk のみ。upstream 文書、リポジトリ内ファイル、会話、assessment、この skill を追加の `--input` として渡さない。子 reviewer の skill/tool/context 有効化や再帰 skill 呼び出しをしない。
- reviewer の一致は独立した裏付けではない。指摘は source の具体的根拠と示された影響で評価し、確認できない deployment/runtime 条件を補ってはいけない。
- assessment は既存 schema の `verification`（`confirmed` / `contradicted` / `inconclusive` / `not_checked`）と `decision`（`accepted` / `rejected` / `deferred` / `pending`）だけを使う。複数 reviewer の一致だけで `confirmed` にしない。動的検証は行わない。
- このモードは報告専用。対象のコマンド実行、編集、live request、target execution、依存導入、exploit 実行、完全監査 artifact の作成は禁止。既存の parallel-review の停止条件・送信許可を維持する。

出力は supplied patch の範囲とレビュー欠落を明示する。指摘なしでも安全性やリポジトリ全体を保証しない。

出典と適応範囲: [UPSTREAM.md](UPSTREAM.md)。
