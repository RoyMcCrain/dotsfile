---
name: impl
description: 分離 Pi 子プロセスで利用可能量を見て Claude Haiku / Luna に実装を振り分ける
---

# /impl

Pi の `impl.default` ポリシーで Claude Haiku / Luna の観測可能な利用可能量を比較して選び、**隔離された非対話 Pi 子プロセス**に実装まで投げるスキル。OpenAI 側は Pi の SIWC Luna quota を直接示すものではなく、Codex CLI quota を参考値として使う。利用量不明時や同率時は runs root ごとの交互選択に戻り、両方枯渇なら dispatch しない。呼び出し元エージェント（Claude / Codex / Pi 等）が「正確な実装プロンプト」を作って渡し、実装後に呼び出し元が検証する。

- Pi 上: `/skill:impl`
- その他ホスト: `/impl`

## 基本方針

**非自明な実装は積極的に impl に委譲する。** 呼び出し元は touchpoint の地図化・プロンプト作成・検証に専念し、コード編集は隔離 Pi 実装エージェントに任せる（数行の自明な編集だけ直接可。迷ったら委譲）。

## 役割分担

- **呼び出し元**: 要件整理・調査（触る箇所マップ）・実装プロンプト作成・実装後の検証（lint / 型 / test / 仕様 / cccc）
- **隔離 Pi 実装エージェント**: 実際のコード編集（read / bash / edit / write）。委譲完了時は変更スコープを分類し、耐久コードは cccc の WARNING 閾値まで含めてスコープ単位で受け入れ基準を満たすこと（下記）。一時的な調査・生成用コードは cccc 任意・助言扱いとする

実装側が一番こけるのは「どこを直すべきか自力で全部見つける」部分。先に touchpoint を地図化して渡す。

## 実行手順

1. **要件整理 + 確定仕様の確認**
2. **触る箇所の調査**: 参照テンプレ・ exhaustive map / switch 漏れを列挙。耐久コードのうち、既存ファイルに新たな処理・条件・分岐を追加または差し替えで導入する場合は委譲前に `check_complexity.sh` で baseline を取り、対象関数の指標を記録する。無関係な既存ファイルや一時コードに baseline は要求しない
3. **実装プロンプト作成**（確定仕様、触る箇所 file:行、参照テンプレ、完了条件 lint/test/型、触ってはいけない箇所、**プロジェクト規約とテスト方針** — 子 Pi は `--no-context-files` のため親プロンプトに明記）。cccc が関係する場合は一時コードか、ソースとして保持・配備するコードかを分類し、追加関数・追加処理と既存ファイルの関数単位 baseline/比較対象、および下記の受け入れ基準を子プロンプトに明記する
   - `~/.pi/agent/APPEND_SYSTEM.md` の `Testing Principles` を読み、適用する原則を既存のプロジェクト規約とともに子プロンプトへ明記する。パス参照だけで済ませず、APPEND_SYSTEM 全文ではなく該当する原則を選ぶ。
4. **実行**（バックグラウンド推奨。stdout は最終 assistant テキスト、stderr に run ログディレクトリ）:

```bash
bash "$HOME/.agents/skills/impl/scripts/run_impl.sh" \
  --prompt "$TMPDIR/impl-prompt.md" \
  --cwd "$PWD"
```

- **実行メトリクス**はリポジトリ外に自動永続化（既定 `~/.local/share/impl/runs` または `IMPL_RUNS_DIR` / `--runs-dir`）。生プロンプト・assistant 全文・ツール引数は保存しない（`references/history-format.md`）
- 比較・固定指定: `--role impl.haiku` / `--role impl.luna`。その他の具体的な catalog role も指定できる（`.pi` 必須、Cursor 専用 role は不可）。固定指定では usage 照会も fallback turn 消費も行わない。Meta Contributor モデルは `impl.muse` 以外の role で使えない
- `--role` 省略時は、Pi が Bash に渡す `PI_PROVIDER` / `PI_MODEL` が Meta Muse Wonder / Muse Spark なら `impl.muse`、それ以外は `impl.default`。明示 `--role`（`impl.default` を含む）を優先する
- オフライン比較レポート（`--runs-dir` 省略時は `IMPL_RUNS_DIR` または XDG/HOME 既定）:

```bash
bun --config=/dev/null --no-env-file --no-install run "$HOME/.agents/skills/impl/scripts/impl_history.ts" report \
  --out "$TMPDIR/impl-report-out"
```

- 親検証の記録（自動ではない）:

```bash
bun --config=/dev/null --no-env-file --no-install run "$HOME/.agents/skills/impl/scripts/impl_history.ts" set-validation \
  --run "$RUN_DIR" --status passed
```

（`passed|failed|not-run` のみ。`completed` かつ exit 0 以外を `passed` にしない）
- レポート JSON/HTML はトークン・コストの **known/expected スライス分母**と run 既知数を表示。`caseKey` は完全な同一性（HTML は短い `displayLabel` + title）。CLI は未知 positional / 重複フラグを拒否。`running` メタデータに elapsed/exit/finished を含めない
- `impl.muse` は自動選択でも明示指定でも `--share-with-meta --cwd --files` が必須。承認がなければ確認し、承認前に実行したり別 provider へ切り替えたりしない。シェル・追加ツールは使えないため、ローカル検証は子プロセスの外で行う:

```bash
bash "$HOME/.agents/skills/impl/scripts/run_impl.sh" --role impl.muse --share-with-meta \
  --cwd "$PWD" --prompt "$TMPDIR/impl-prompt.md" --files "$TMPDIR/approved-files.txt"
```

- `--files` は作業ツリー基準の通常テキストファイルを 1 行 1 件で列挙する。`.git`・`.jj`・`.pi`・`node_modules`・`.env*`・認証/秘密らしい名前、symlink、作業ツリー外への解決は拒否される。
- Pi では `/skill:impl` の依頼文に共有承認を書ける。Muse セッションでは `impl.muse` の指定を省略できる。
- Meta に送信するのは、ユーザーが明示的に承認した関連 OSS 入力だけ。秘密・個人情報・共有権限のない内容は送らない。Meta では送信内容が学習に使われる可能性があり、ローカル検査で秘密をすべて検出できるわけではない。
- 既定ポリシーは `impl.default`。Claude OAuth の five-hour / seven-day 利用率と Codex CLI の primary / secondary quota を読み取り、各側の最小 remaining percentage を比較する。OpenAI 値は Luna の per-app quota ではなく Codex reference。片側不明なら既知の正の側を選び、片側が既知 0・他方不明なら不明側を選ぶ。両方 0 は dispatch 前に失敗
- 同率または両側不明時のみ runs root ごとの SQLite 交互選択を消費し、新しい root は Haiku から開始する。優先度による選択は turn を進めない。fallback 選択後の失敗（選択された provider の拡張不足も含む）は割り当て済み turn を消費する。固定 role は usage query も turn 消費もしない
- 照会先の失敗は unavailable として扱うが、collector 自体の実行異常や不正な snapshot はインストール・プログラム異常を隠さず停止する
- Catalog の `impl.default` resolver は後方互換のため単一 Luna model を返す。ランナーのみ quota-aware policy を適用し、候補はそれぞれ `impl.haiku` / `impl.luna` resolver で解決・検証する
- モデル ID は skill / runner に書かない。変更はカタログの `.pi` のみ（`resolve-model.sh --list` / `resolve-model.sh impl.haiku` / `resolve-model.sh impl.luna` / `resolve-model.sh impl.muse` で確認）
- 毎回 **新規** 非対話 Pi（`--no-session --no-skills --no-prompt-templates --no-context-files --no-extensions --no-mcp`）。親の settings / packages / SYSTEM.md / 拡張は読まない。Haiku が選ばれた場合のみ、Claude subscription provider のため、インストール済み・pin 済み `pi-claude-code` package だけを明示ロードする（`PI_CLAUDE_CODE_EXTENSION` または agent config の package path）。`impl.muse` では承認ファイルを制限する拡張だけを明示ロードする。それ以外の拡張 discovery は無効のまま。
- **隔離はサンドボックスではない**（Bun は Deno の `--allow-*` 相当の権限制限を提供しない。`--cwd` は作業ルートの指定にすぎない）。プロンプトで触るファイルを絞る
- Haiku は Claude Code CLI 経由で Claude subscription を使う。quota credential / usage と Codex quota は読み取り専用で照会し、秘密情報・snapshot は保存しない。usage-credit opt-in は子プロセスで無効化するが、これは最初の要求に料金が発生しない保証ではない
- OpenAI Codex 系 provider の認証: `pi auth check --provider openai-codex --json`（**資格情報の内容は出力しない**）

5. **呼び出し元による検証**（必須）: diff 目視、lint、関連する test、型（プロジェクトで型がある場合）、仕様充足、テストの必要性・既存テストとの非重複、**cccc のスコープ分類と受け入れ判定**（下記）。実装側・呼び出し元の双方がスコープ単位で検証する。Pi の `executionStatus: completed` はストリーム完了でありタスク正しさやテスト成功を意味しない。検証後に `set-validation` で親結果を記録する
6. 問題があれば軽微は呼び出し元が修正、大きければ追加プロンプトで再委譲（同一未達事項は **最大 2 回** まで再試行し、それでも未達なら報告してユーザーに確認）
7. 一時プロンプトは push 前に削除

## 並行化

独立作業は **ファイル集合が disjoint** なバッチに分割し、**別プロセス・別ログ**で起動する（同一 working copy 上で競合しないファイルだけを各バッチに割当）。

- 共有グルーコード（union 型・登録 index 等）は呼び出し元が書き、実装エージェントには閉じた編集だけ渡す
- ホストがサポートする **バックグラウンド実行**（Cursor / Pi / Claude 等の並行 Bash や job 機構）を使う
- ログ例: `$TMPDIR/impl-1.log`, `$TMPDIR/impl-2.log`

## 複雑度チェック（cccc）— 受け入れ必須

```bash
# 既定で判定が自動記録される
bash "$HOME/.agents/skills/impl/scripts/check_complexity.sh" path/to/changed.ts
# 比較する場合は実装前後で同じ --case を指定
bash "$HOME/.agents/skills/impl/scripts/check_complexity.sh" --phase before --case issue-123 path/to/changed.ts
bash "$HOME/.agents/skills/impl/scripts/check_complexity.sh" --phase after --case issue-123 path/to/changed.ts
# 履歴のオフライン集計
bash "$HOME/.agents/skills/impl/scripts/report_complexity.sh"
```

- **変更した cccc 対応の通常ソースのみ**明示列挙（リポジトリ全体・自動 diff 列挙は使わない）。対象はパスで自動免除せず、意図する寿命・配備で分類する。tmp 内でも保持・配備するソースは耐久コードとして確認する。一時的な調査/生成スニペットで、ソースとして保持しないものは cccc と複雑度リファクタを必須としない。正しさ・安全性・適切なテスト要件は別途満たす。
- **警告閾値**: 認知 **> 10**、循環 **> 8**。保持・配備する新規ファイル・新規関数、および AI の追加処理（差し替えで導入する新たな条件・分岐も含む）に起因する WARNING は解消する（新規関数は認知 <=10、循環 <=8）。**hard 閾値**は認知 **> 15**、循環 **> 10**。
- `check_complexity.sh` はファイル全体を計測し、**exit 0**（計測済み・hard なし。WARNING の有無は問わない）、**exit 1**（hard あり）、**exit 2 / UNVERIFIED**（未検証）を返す。これらのツール上の意味は変更しない。ファイル出力/exit は診断であり、それだけでは変更スコープの受け入れ判定にならない。特に exit 0 でも AI の追加処理に起因する WARNING があれば未達。baseline で確認された既存違反だけに起因し、追加による悪化がない exit 1 は、対象関数・比較証拠・スコープ結果を記録した場合に限り、それを理由に無関係な cleanup を要求しない。ログを pass と言い換えたり、checker が diff を自動帰属したかのように扱わない。
- **exit 2 / `UNVERIFIED`**: 必須の計測は未検証として扱い、合格にしない。必要な baseline がない/未計測、または安全に帰属できない場合、既存違反と推定せず unverified と報告する。
- 複数ファイルの集約優先度: **exit 2 > exit 1 > exit 0**
- **baseline と既存関数**: 既存ファイルに新たな処理・条件・分岐を追加または差し替えで導入する場合は実装前後の関数単位指標と実際の diff を照合し、追加部分と既存負債を区別する。追加による新たな WARNING/hard 閾値超過や既存の超過値の悪化を防ぎ、追加処理を合意スコープ内でリファクタする。変更した関数でも、追加に起因する新たな閾値超過や既存の超過値の悪化がなければ、既存由来の WARNING 解消は要求しない（例: 認知 12→12 で、循環にも新たな閾値超過や既存超過値の悪化がない場合）。ファイルを編集しただけで、未変更の既存関数すべてを閾値以下にする必要はない。純粋な整形/rename と未変更関数は負債解消の対象外。上記の `--phase before|after` と同じ任意の `--case` を付けるとレポートで比較できる。通常チェックは `check` として自動記録される。
- **追加スコープの WARNING/hard**: リファクタして再計測し、lint・型・関連テストも再実行する。メトリクスを避けるためだけに関数を分割しない。読みやすさと KISS を保ち、挙動を維持する。許可された範囲内で解消できない場合は基準未達としてユーザーに確認し、暗黙の WARNING 例外を設けない（forbidden scope が優先し、許可範囲を自動で拡大しない）。
- Bash / Fish 等 cccc 非対応は ShellCheck・shfmt・Bats
- cccc 履歴は既定で `${XDG_DATA_HOME:-$HOME/.local/share}/impl/complexity` に保存（`CCCC_LOG_DIR` または `--log-dir` で変更）。評価は `report_complexity.sh [--log-dir DIR]` で行う。比較キーは同一 case・リポジトリ・入力ファイル（cwd 基準の物理的・正規化済みパス。未存在入力も `.` / `..` 等を正規化）。既存シンボリックリンクは解決する。ログルートとその祖先は信頼可能な所有者・書込み権限である必要があり、root 自体の symlink は拒否する。最新の before / after を使い、後の未検証記録を古い成功で置き換えない。閾値が異なる記録は比較しない。保存に失敗した場合も exit 2 で合格にしない。レポートの check 件数は実行回数であり、独立したタスク数・品質の証拠ではない。比較は数値メトリクスのみで、品質やバグ防止の証明ではない。

## モデル

- 既定ポリシー: **`impl.default`**（利用可能 quota 優先、同率・両方不明時は交互 fallback）
- `resolve-model.sh impl.default` は互換性のため legacy Luna model を返すだけで、quota policy を表さない。実際の各候補は `resolve-model.sh impl.haiku` と `resolve-model.sh impl.luna` で確認する
- 候補モデルの変更: `pi/agent/model-roles.json` の `impl.haiku` / `impl.luna` の `.pi` を編集する。`impl.default.pi` は直接 resolver の互換用であり、runner の既定候補には影響しない

## 互換

- 非推奨 alias: `cursor-impl`（`/skill:cursor-impl`）— 中身は本スキルと同じ方針。新規は `/impl` を使う
