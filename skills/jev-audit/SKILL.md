---
name: jev-audit
description: Jev の自動ルーティング深さを週次サンプルで監査し、妥当性・判断の不一致候補をローカル JSON/HTML で報告する。
---

# jev-audit

Jev の **requestedLevel=auto**
履歴から週次サンプルを選び、**パッチのみ**を独立監査モデル（既定
`review.codex`）に渡して許容深さレンジ L1–L5 を取得し、effective / suggested
との**不一致候補**（Jev 判断の妥当性の参考）をローカル HTML/JSON で報告する。

## 安全（必読）

- 過去のレビュー履歴だけでは **外部送信への同意にならない**。既定の `run`
  は未承認ケースを `needs_preflight` として扱い、送信しない。手動 `approve`
  はパッチを目視確認してから行う。
- 週次ジョブの `--auto-approve` はユーザーが明示的に有効化した場合だけ、Codex
  (`openai-codex/`)
  に対する継続的な承認となる。自動モードでもローカルのパッチ検証と追加の保守的な認証情報・個人情報ヒューリスティック検査を通らないケースは保留し、承認記録も実行試行も作らない。疑わしいケースは人が検査して手動承認する。
- このローカル検査は秘密情報や個人情報の不存在を証明しない。誤検知・見逃しの可能性があるため、`--auto-approve`
  を有効にする判断自体が信頼境界となる。誤検知を人が確認する場合は
  `--auto-approve`
  ではなく通常の手動実行フローを使う。認証情報・顧客データ・雇用先機密は送信しない。
- `approve` は `--approved-input` の **実バイト列の SHA-256** が計画の
  `patchSha256` と一致すること、run の
  `metadata.json`（`levelDecision.patchSha256`）が計画と一致すること、および
  `review_common` 相当のローカル検証を通過することを要求する（API
  呼び出しなし）。
- 未承認ケースは `needs_preflight` / held
  のままレポートに載る。本リポジトリ同梱の launchd プレビュー以外に
  **ライブスケジュールはインストールされない**。
- 監査人プロンプトに Jev の level / confidence / run
  メタデータは含めない。ルーティング tier や Jev を再実行しない。
- 監査データディレクトリは **parallel-review runs 配下に置けない**（既定 runs
  と同階層の `jev-audit` を使用）。

## 週次期間と承認パケット

- **UTC の月曜 00:00 半開区間** `[weekStart, weekEnd)`。既定は「直前に完了した
  UTC 週」。
- **`prepare` で新規に週ディレクトリ／不変 `plan.json` を作るのは、`weekEnd` が
  UTC で既に過ぎた（完了した）週のみ**。進行中・未来の UTC 週は拒否する（既存
  完了週の読み取り・承認・実行・レポートは従来どおり）。
- `--week YYYY-MM-DD` は **UTC
  月曜**である必要があり、日付は厳密に検証される（例: 2026-02-30 は拒否）。
- macOS スケジュール（月曜 09:00 **ローカル**）と UTC
  週境界は一致しない場合がある。
- **承認（approval）は週ごとに永続**し、当週の `runId` / `patchSha256` /
  解決済み監査モデル / **承認時点の `promptHash`**
  を束ねる。書き込み済みの一時ファイルを 原子的に公開し、**同一 runId
  の再承認・上書きは不可**（途中の承認は公開しない）。
- 監査人プロンプトを更新した場合、古い承認は `prompt_changed` で **held**
  になる。新プロンプトで送るには **新しい週の計画で別 runId
  が選ばれた場合など、新規 approve
  が必要**（既存承認ファイルの差し替えはサポートしない）。
- `run` は既定で手動承認済みケースだけを処理する。明示的に `run --auto-approve`
  とした場合のみ、Codex に対してローカル preflight
  から不変の自動承認を作成する。フラグは他のコマンドでは拒否される。
- `run` はモデル解決・パッチ検証などを **その場で再チェック**する。`prepare` /
  `report` は disk 上の承認・結果・attempt から状態を **再構成**する（held
  理由のうち、再構成時に永続化されないもの — 例: その時点のモデル解決失敗 — は
  `report` 再生成だけでは復元されない）。

## CLI ワークフロー

**リポジトリルートからそのまま実行できる例（パスは環境に合わせて `--runs-dir` /
`--audit-dir` を差し替え）:**

```bash
bun --config=/dev/null --no-env-file --no-install run skills/jev-audit/scripts/audit.ts prepare
```

続き（プレースホルダ付き）:

```bash
bun --config=/dev/null --no-env-file --no-install run skills/jev-audit/scripts/audit.ts prepare \
  --runs-dir PATH --audit-dir PATH --week YYYY-MM-DD

bun --config=/dev/null --no-env-file --no-install run skills/jev-audit/scripts/audit.ts inspect \
  --run-id RUN_ID --runs-dir PATH --audit-dir PATH --week YYYY-MM-DD

bun --config=/dev/null --no-env-file --no-install run skills/jev-audit/scripts/audit.ts approve \
  --run-id RUN_ID --approved-input STAGED_PATCH_PATH \
  --runs-dir PATH --audit-dir PATH --week YYYY-MM-DD

bun --config=/dev/null --no-env-file --no-install run skills/jev-audit/scripts/audit.ts run \
  --runs-dir PATH --audit-dir PATH --week YYYY-MM-DD

bun --config=/dev/null --no-env-file --no-install run skills/jev-audit/scripts/audit.ts report \
  --runs-dir PATH --audit-dir PATH --week YYYY-MM-DD
```

- 状態ディレクトリ既定:
  `${XDG_DATA_HOME:-$HOME/.local/share}/parallel-review/jev-audit`
- `prepare` / `report` は成功・失敗・held・preflight 状態を disk
  から復元する（毎回 `needs_preflight` には戻さない）。
- レポートの集計・週次比較（WoW）は **記録済み** `resolvedAuditorModel` と
  **結果に記録された `promptHash`**
  のみを用いる（現在のプロンプト指紋への書き換えはしない）。モデルまたはプロンプト指紋が混在する週は
  `mixedAuditors` となり、率の週次比較は unavailable。

## スケジュール

### macOS launchd（プレビューのみ同梱）

```bash
skills/jev-audit/scripts/install_weekly_launchd.sh        # plist プレビュー（副作用なし）
skills/jev-audit/scripts/install_weekly_launchd.sh --install  # 明示時のみ（Darwin、plutil 検証後 load）
skills/jev-audit/scripts/install_weekly_launchd.sh --auto-approve # preview に Codex 自動承認フラグを含める
# standing approval job は --install --auto-approve の両方を明示した場合のみ有効
```

plist
はインストール時のリポジトリ・実行ファイルの絶対パスを保持するため、実行元の
workspace を削除・移動する場合は再インストールする。明示した `MODEL_RESOLVER`
も保存される（絶対パスの読取可能な通常ファイルが必要）。

### Linux / WSL（cron）

crontab 1 行に `\` 継続は使えない。環境変数の設定は **ラッパ shell スクリプト**
に書き、cron からそのスクリプトを 1 行で呼ぶ。Bun には Deno のような実行時
ファイル・環境・子プロセス権限 sandbox がないため、これらの scope を設定できない。
アプリケーション側のパス検証や秘密情報の制御は維持されるが、実行時 permission
sandbox の同等性は提供されない。

```cron
0 9 * * 1 /home/you/bin/jev-audit-weekly-run.sh
```

ラッパ例は各環境の `PATH` / `bun` を自分で合わせる（本 SKILL では固定の
crontab 行は示さない）。

### ロック回復

`.audit.lock`
がクラッシュ後に残った場合、**稼働中プロセスがないことを確認したうえで削除**する（監査ツリー全体の
`rm -rf` は不要）。

## 参照

- 深さ rubric: `parallel-review` の `REVIEW_CRITERIA`（監査プロンプトと共有）
- 履歴形式:
  [`parallel-review/references/history-format.md`](../parallel-review/references/history-format.md)
