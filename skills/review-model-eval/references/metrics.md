# review-model-eval メトリクス定義

正本データ契約: [../../parallel-review/references/history-format.md](../../parallel-review/references/history-format.md)

## グループ化

モデルサマリのキーは **完全一致** の 4 要素:

1. `execution.backend`
2. `execution.model`（effort 含む完全文字列）
3. `metadata.level`
4. `snapshot.actor.kind`（`agent` / `human` は混ぜない）

同一グループに寄与した `actor.id` を列挙し、判断源バイアスを可視化する。合成スコアや自動ランキングは行わない。

## ケース行

1 行 = `(runId, backend, model)`。

- `coverageKey`: 当該モデルの execution に紐づく **chunk SHA-256 をソートして連結**
- `completedParsed`: 当該モデルの全 execution が completed かつ exit 0 で、verdict が `findings` または `no_findings`（`unparsed` / `unavailable` を含むと false）
- `comparableForQuality`: **同一 run 内**に、別 `(backend, model)` ペアが存在し、双方 `completedParsed` かつ **同一 `coverageKey`** の場合のみ true。単一モデル・run 跨ぎ・coverage 不一致・未完了/失敗は false

ケース行には decision / verification / action 内訳とケース別採用率（分母 0 なら率未定義）を含める。

## issue 集計

キー: `(runId, backend, model, issueKey)`。chunk / finding 重複は 1 issue に統合。

| 次元 | 統合ルール | デフォルト |
|------|-----------|-----------|
| decision | 全一致 → その値 / 不一致 → `conflict` | なし |
| verification | 全一致 → その値 / 不一致 → `conflict` | `not_checked` |
| action | 全一致 → その値 / 不一致 → `conflict` | `unknown` |

`conflict` は該当率の分子・分母から除外するが、unique issue 総数には含める。

### 採用率

`accepted / (accepted + rejected)`。`pending` / `deferred` / `conflict` は分母外。分母 0 なら率は未定義（HTML は em dash）。

### 裏取り

- **確認率**（ラベル: 裏取り済み指摘の確認率）: `confirmed / (confirmed + contradicted)`
- **coverage**: `(confirmed + contradicted) / unique issues`
- `not_checked` は false ではない。`rejected` も false ではない。

### action

`fixed` は `accepted` から推論しない。記録値のみ。

## 実行統計（issue dedup なし）

対象: グループに属する全 execution。

| 区分 | 定義 |
|------|------|
| completed | `status === completed` |
| successful | completed かつ `exitCode === 0` |
| failed | completed かつ `exitCode !== 0` |
| timeouts | failed のうち `exitCode === 124` |
| unfinished | `pending` / `running` |
| no_findings | verdict `no_findings` |
| unparsed | verdict `unparsed` |

率（成功/失敗/timeout）は **completed** を分母。median 成功実行時間 = `endedAt - startedAt`（秒、successful のみ。内部リトライを含み `maxAttempts` 実測ではない）。

## snapshot 選択

1 run あたり snapshot 候補に invalid / symlink / unreadable / unsupported が **1 件でも**あれば run 全体を除外（有効な旧 snapshot へフォールバックしない）。

全候補が valid なら `savedAt` 最大を 1 件。同 ms で内容が異なれば run 除外 + 警告。同一 run 内に複数 `runId` があれば run 除外。

runId が複数フォルダに存在: 内容一致なら 1 回カウント + 警告 / 不一致なら該当 runId をすべて除外。

## caveats（レポートに必ず含める）

- outcome selection bias
- run 間でタスク coverage が混在する all-history 率は記述的のみ
- 未 spawn の plan chunk は snapshot から検出不可
- `actor.kind=human` は snapshot 全体の provenance であり finding 単位の承認ではない
- accuracy / recall / cost / token は測定しない
- 低サンプルではランキングを支持しない
