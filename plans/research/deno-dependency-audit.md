# denops 以外の Deno 依存と代替案

調査日: 2026-10-13
対象: dotsfile の trunk `21445f16`、専用 workspace `deno-audit`
状態: Pi の `*.test.ts` は Bun へ移行済み。以下の件数と「現在の用途」は、その移行前に trunk `21445f16` を調べたスナップショット。skill CLI と denops は未移行。

## 結論

- denops/dpp は今回の移行対象外として維持する。Deno 自体を devbox から削除しない。
- それ以外の主な実行依存は AI skill の補助 CLI。Deno API を直接使う本番 TypeScript は **25ファイル**。
- テストにも依存があり、**43ファイル、695個の `Deno.test` 登録箇所**。これは静的な登録箇所数であり、実行結果や動的展開後の件数ではない。
- ユーザーの希望に合わせ、第一候補は **Bun + 既存の Node 互換 API + `bun:test`**。Deno の代替 runtime に Node.js を選ぶ必要はない。
- 最大の注意点は Deno の scoped permissions。Bun に同等の host/env/実行バイナリ単位の権限制御はなく、コマンド名だけ置換して保護を消してはいけない。
- JSON 整形やレポート CLI から小さく移し、Pi テスト、レビュー・実装の実行基盤、週次監査へ進める。

## 1. 「Deno 終了」の正確な意味

2026-10-09 の Deno 公式発表は次の内容だった。

| 対象 | 公式発表 | このリポジトリへの意味 |
| --- | --- | --- |
| Deno runtime | さらに1年間、月次のバグ修正・セキュリティ更新。その後、現在のチームによる開発を終了。OSS は残る | 今すぐ実行不能にはならないが、2027年10月頃までを移行検討の目安とする |
| Deno Deploy | 6か月間運用後に終了。有料顧客には Workers 移行支援 | Deploy/deployctl の利用は今回のリポジトリ検索では見つからなかった |
| JSR | Cloudflare にインフラを移して継続 | Pi テストの `jsr:@std/assert` は、registry 終了が理由で直ちに移行必須というわけではない |

「2027年10月頃」「2027年4月頃」は発表日からの目安。公式本文は期間を示しており、厳密な終了日をここで断定しない。OSS の存続は、将来の保守体制が保証されたことを意味しない。

Deno 公式本文を Firecrawl で取得し、Cloudflare の共同発表と agy の調査を突き合わせた。Grok X Search の公式投稿はチーム移籍とブログへのリンクを裏付けるが、投稿本文だけでは製品別の終了条件を確認できない。終了条件の根拠は Deno 公式ブログ。

## 2. 利用箇所と代替案

工数はテストと呼び出し元更新を含む概算。S=数時間程度、M=1日前後、L=複数日。実装計画を確定した見積もりではない。

| 分類 | 現在の用途・根拠 | 代替案 | 工数 / 移行リスク |
| --- | --- | --- | --- |
| Neovim の JSON 整形 | `nvim/lua/custom-function.lua:253`、`:273` の `deno fmt --no-config --ext json -`。`nvim/init.lua:237` の `:Format` から実行 | 厳密な JSON の整形なら既存の `jq .`。コメント・数値リテラル・重複キー等の扱いを維持する必要があれば Prettier 等を比較。Bun の runtime 移行とは分ける | S / LOW〜MED。denops とは独立した利用 |
| レポート関連 skill | `skills/review-report/scripts/render_report.ts:4051`、`:4097`、`merge_verifications.ts:45`。implementation-report の組立・秘密パス判定・VCS情報収集も Deno | Bun で TS を直接実行。filesystem は既存の Node 互換 API に揃え、子プロセスは `Bun.spawn` 等 | M / MED。3種類の report skill が共通 renderer を利用する |
| Pi のテスト | 移行前は `pi/agent/tests/codex-usage.test.ts:1` の JSR import と `Deno.test`。現在は `scripts/run_tests.sh` が `bun --no-install test` で `*.test.ts` を実行 | 対応済み。assertion は `pi/agent/tests/assert.ts`。`*.node.test.mjs` は Node のまま | 完了。Deno の `--allow-*` は再現していない |
| parallel-review | `skills/parallel-review/SKILL.md:163` の Jev routing、`:183` の履歴 init。`run_pi_review.sh:294` のイベント helper | Bun と既存の互換 API。HTTP は既存の `fetch`、stream 型の子プロセスは `Bun.spawn` を検討。権限制御は別途設計確認 | L / HIGH。routing・履歴・timeout・privacy を同時に壊さないこと |
| impl | `skills/impl/scripts/run_impl.sh:65` で Deno 必須、`:251` でイベント helper 起動。`run_impl_events.ts` と `impl_history.ts` | `Bun.spawn`、`node:fs/promises`、`process`。既存の純粋な stream parser は維持 | L / HIGH。stdout、終了判定、usage、子プロセス終了、private artifacts を維持 |
| jev-audit | `skills/jev-audit/scripts/audit.ts:550` の CLI、`state_io.ts:23` の private/atomic 保存。`install_weekly_launchd.sh:354` 以降の plist が Deno を起動 | Bun と互換 filesystem API。launchd/cron のラッパと permission 前提も合わせて更新 | L / HIGH。承認・秘密検査・多重実行防止・再課金防止の回帰を優先 |
| review-model-eval | `skills/review-model-eval/scripts/evaluate_models.ts:190` 以降の Deno filesystem/error 処理、`:999` の CLI。review history を import | Bun と既存の互換 API。review history 移行と順序を合わせる | M / MED。symlink 拒否、集計の分母、unknown の意味を維持 |
| 開発ツール・LSP・設定 | `devbox/devbox.json:24-26`、root `deno.json` / `deno.lock`。`nvim/lua/plugins/nvim-lspconfig.lua:160`、`:194`、`:539` | Bun 用 `package.json` / `tsconfig.json` / 必要な型依存を用意。Deno 設定は nvim 用と移行期間のテスト用途を分離 | M / MED。root の Deno marker が通常の TS LSP 選択を妨げるため、最後に整理 |

### レポート skill の共通依存

- `implementation-report`: 共通 renderer、秘密パスフィルタ、repository metadata、レポート組立、patch 収集 shell。
- `review-report`: renderer と verification merge。
- `review-verify`: 独立した Deno 実装ではなく、review-report の CLI を呼ぶ。

共通 renderer を変える場合、3種類の呼び出しドキュメントも同じ段階で更新する。

### レビュー runner の依存条件

`run_pi_review.sh` は `--events-log` を指定したときに Deno を必要とする（`:210` 以降）。すべての単体 reviewer 呼び出しが無条件に Deno 必須ではない。一方、通常の parallel-review は routing と履歴にも Deno を使うため、レベルを明示して Jev 通信を避けても Deno 依存はなくならない。

### 設定・ドキュメントの付随参照

- `claude/settings.json:105`: sandbox `excludedCommands` に `deno`。移行時は Node への無差別な除外追加ではなく、既存の sandbox 前提を確認する。
- `pi/README.md`: routing、履歴、impl 集計、テストの Deno コマンド。
- 各 `SKILL.md` と `references/`: canonical の実行例を更新し、公開 symlink 側を重複編集しない。
- `SETUP.md:58`: pre-push の Deno + bats 説明。
- `AGENTS.md` / `CLAUDE.md`: nvim に関する `deno lint` / `deno fmt` / cache の案内。denops 維持中は一括削除しない。
- `pi/agent/lib/fugu-model-routing.ts:299` の `deno` はコマンド分類の文字列であり、そのモジュールが Deno を実行している根拠ではない。

## 3. Deno API を直接使う本番コードの全リスト

パスは各 `skills/<name>/scripts/` 相対。`Deno` の文字列言及だけのファイルは除外し、AST の member expression と source search で確認した。

| skill | ファイル数 | ファイル |
| --- | --- | --- |
| parallel-review | 3 | `select_review_level.ts`, `review_history.ts`, `pi_review_events.ts` |
| impl | 2 | `run_impl_events.ts`, `impl_history.ts` |
| implementation-report | 3 | `filter_secret_paths.ts`, `collect_repository_metadata.ts`, `assemble_report.ts` |
| review-report | 2 | `render_report.ts`, `merge_verifications.ts` |
| review-model-eval | 1 | `evaluate_models.ts` |
| jev-audit | 14 | `audit.ts`, `approval_store.ts`, `audit_run.ts`, `locate_run.ts`, `lock.ts`, `model_resolve.ts`, `patch_io.ts`, `paths.ts`, `plan_store.ts`, `prepare_plan.ts`, `report.ts`, `result_store.ts`, `runner_invoke.ts`, `state_io.ts` |

間接 import を含む移行対象はこの25ファイルに限らない。例えば jev-audit の pure modules が parallel-review の定義・履歴を import している。runtime API のない pure modules を不用意に書き直す必要はない。

## 4. テストの依存範囲

| 対象 | Deno.test を含むファイル数 | 登録箇所数 |
| --- | --- | --- |
| `pi/agent/tests` | 0（移行前は 7 / 127。現在は `bun:test`） | 0 |
| `skills/parallel-review/tests` | 5 | 194 |
| `skills/impl/tests` | 3 | 76 |
| `skills/jev-audit/tests` | 24 | 123 |
| `skills/implementation-report/tests` | 2 | 33 |
| `skills/review-report/tests` | 1 | 119 |
| `skills/review-model-eval/tests` | 1 | 23 |
| 合計 | 36（移行前 43） | 568（移行前 695） |

既存の Node テストは `pi/agent/tests/openrouter-balance.node.test.mjs` と `repo-memory-local.node.test.mjs`。後者は `node:test`、`node:assert/strict`、`stripTypeScriptTypes`、VM module を利用している。Bun 1.3.13 では `node:module.stripTypeScriptTypes` が未提供であることを実機確認したため、この loader をそのまま Bun に持ち込めない。Bun の TS transpilation に合わせて loader を見直す。`vm.SourceTextModule` のインスタンス生成は確認できたが、loader 全体の互換性を確認したものではない。

`.githooks/pre-push:6` は `scripts/run_tests.sh` を呼び、同スクリプトは Deno を必須ツールとして扱う。このため日常の push 前検証にも Deno が関与する。

注意: 現状の `scripts/run_tests.sh` は Pi、report skills、impl の Deno suite を実行するが、parallel-review、jev-audit、review-model-eval の Deno suite は列挙していない。移行時はこのスクリプトだけで全対象を検証したつもりにならず、変更した subsystem の既存 suite も個別に実行する。

## 5. 移行先の比較

### 推奨: Bun を runtime にし、動いている互換 API は残す

ユーザーは Node.js runtime を希望していないため、Bun を第一候補にする。`node:*` という import 名を使うことと、Node.js の実行ファイルで起動することは別。Bun が実装する互換 API を使えば、動いている filesystem/hash/path 処理を無駄に書き直さずに済む。

根拠:

1. devbox に `bun@latest` があり、調査環境は **Bun 1.3.13**。新しい runtime を導入しない。
2. Bun は TS を直接実行する。既存の4モジュールを `bun --no-install --eval` から import できた: `automatic_preflight.ts`、`impl_stream.ts`、`review_context.ts`、共通 `render_report.ts`。
3. 同じ実機で `node:fs/promises`、`node:path`、`node:crypto`、`node:child_process` の対象 API が解決できた。既存の pure function 2件の smoke check も成功。
4. `Bun.spawn` の stdout が Web `ReadableStream` で、子プロセスの非0終了コード7を `await proc.exited` で受け取れることを実機確認した。Deno の Web Stream ベースの処理から移しやすい。
5. Bun 公式 compatibility 表には fs/path/assert の実装が掲載されている。一方、child_process/crypto 等には差異もあるため、Node API の全面的互換を仮定しない。

**Deno の完全な drop-in replacement ではない。** `Deno.*` globals、`Deno.test`、permission flags は変更が必要。Bun の既存モジュール import 成功は、各 CLI 全体の互換性や private/atomic file 保存を証明しない。

最小の構成案:

- 実行は `bun run <script.ts>`。既存の純粋な TS 関数と、Bun で動く `node:*` imports は維持する。
- `Deno.Command` を Web Stream のまま移す箇所には `Bun.spawn`。既存の `node:child_process` を無条件にすべて書き直す必要はない。
- テストは `bun:test` + `bun test`。既存の Node assertions は使える範囲で維持し、Deno 固有の permissions/options/fixtures と子 CLI の再実行は明示的に移す。
- Bun 用の型定義・dependency 定義と typecheck を別に整備する。TS を実行できることと型チェックに成功することは別。
- root `deno.json` の import map を Bun の dependency 定義と混同しない。Pi SDK 等が必要な箇所は package 定義を用意する。
- `bun build --compile` は将来 CLI 配布が必要な場合の選択肢。今回はすでに Bun があるため、最初から compile 工程を増やさない。

公開 docs は最新版の仕様を含む。ローカル 1.3.13 と同じだとは扱わず、`bun check` 等の新しい機能や互換改善を前提にせず、実装時に採用版を確認する。この調査では Bun を更新していない。

### Node.js

当初の比較対象として調査したが、ユーザーの希望により採用候補の第一順位から外した。初回診断では本番53ファイルの type stripping が成功したものの、これは構文診断にすぎず、Node を採用すべき根拠にはしない。Pi 本体や他の既存ツールの Node 利用は、Deno 補助 CLI の Bun 移行とは別の範囲。

### shell / Python / Cloudflare Workers

- 小さな JSON 処理だけなら `jq` 等に寄せられるが、typed な report schema、stream parser、監査状態管理まで shell に移すのは不適切。
- Python/Go 等への全面書き換えは既存 TS の pure logic とテストを捨てる負担が大きい。
- Cloudflare Workers は Deploy の移行候補であって、ローカル filesystem と Pi/jj/git 子プロセスを操作する今回の CLI の直接的な代替ではない。

## 6. API 置換で維持すべき契約

| Deno 側 | Bun 側候補 | 取り違えを避ける点 |
| --- | --- | --- |
| `Deno.args`, `Deno.env`, `Deno.exit`, `Deno.pid` | `process.argv.slice(2)`, `process.env`, `process.exitCode`, `process.pid` | exit 前に stdout/書き込みが完了すること、環境変数の渡し方 |
| read/write/chmod/rename/realPath | 既存の互換 `node:fs/promises`、同期版は `node:fs` | encoding、mode、append/exclusive create の意味。Bun.file に全面移行しない |
| `Deno.errors.NotFound` 等 | errno `code` 等による判定 | `ENOENT` 以外を「存在しない」として握りつぶさない |
| `Deno.FileInfo` | 互換 `Stats` | `isFile` / `isSymlink` の boolean と `isFile()` / `isSymbolicLink()` の method の差 |
| `Deno.open` / FsFile | 互換 FileHandle | `read()` の EOF/bytesRead、部分 read/write、`sync()`、close の async 化 |
| `Deno.Command` | `Bun.spawn` / `Bun.spawnSync`。既存の互換 spawn/execFile は必要に応じ維持 | `piped`→`pipe`、`null`→`ignore`、stdout/stderr、backpressure、`exited`、signal、元の exit code |
| `Deno.makeTempDir/File` | 互換 `mkdtemp` と exclusive open 等 | 保存先・同一 filesystem の atomic publish・0600/0700 |
| `Deno.test` / JSR assert | `bun:test` / 互換 `node:assert/strict` 等 | options、fixtures、子 CLI の再実行、permission 拒否テストの意図 |

特に `skills/jev-audit/scripts/state_io.ts` は exclusive create、fsync、hard-link による no-overwrite publish、symlink/hard-link 拒否を持つ。単なる `writeFile` に簡略化しない。イベント処理も raw prompt/patch/秘密情報を artifacts に保存しない契約を維持する。

### Scoped permissions は別の検討事項

現在の具体例:

- parallel-review: `--allow-net=openrouter.ai:443` と `--allow-env=OPEN_ROUTER_API_KEY`。
- Pi events wrapper: `--allow-run=<pi executable>` と `--allow-write=<events log>`。
- impl: read/write/run の scope と隔離 Pi config。
- 週次監査: launchd plist の read/write/env/run scope。

Bun 1.3.13 には上記の Deno permission flags の同等機能がない。インストール時の lifecycle script 制限は runtime の file/network/process scope とは別。比較した Node 24.12.0 の `--permission` も env/host/binary scope の同等置換ではなく、Node を使えばこの問題が解決するわけではない。

Bun 移行時には、既存の secret/preflight 検査・パス/所有権検査・Pi の isolation flags を維持し、必要な filesystem restrictions を評価する。限定された env、固定された endpoint/実行先等をコードで守ることと、OS による隔離は同じ保証ではない。現状と同等の境界が必須なら OS/container 隔離を検討し、満たせない部分は報告してから判断する。

## 7. 推奨する段階

1. **小さな独立経路**: JSON `:Format` と共通 report CLI。JSON 整形は入力仕様を確認。レポートは既存の組立/検証/render/秘密パス/metadata テストを維持する。
2. **Bun の検証基盤**: Pi の `*.test.ts` は Bun へ移した。残るのは Node 専用 loader の見直しと、Deno marker が通常の TS LSP 選択を妨げないことの整理。
3. **parallel-review と impl**: 各 subsystem のテストを保った小さな変更で、routing/history と events/process 処理を移す。権限差・timeouts・終了コード・metadata-only 保存を受け入れ条件にする。
4. **review-model-eval と jev-audit**: review history の移行後に進める。週次実行は CLI の検証を先に完了し、launchd の変更・再インストールは明示的な別作業にする。
5. **整理**: `scripts/run_tests.sh`、SKILL の実行例、README、root Deno 設定を整理。denops/dpp 用の Deno とその依存は残す。

report と Pi テストは比較的独立して進められる。jev-audit と model-eval は parallel-review の定義・履歴に依存するため、その後に配置する。

具体的な実装計画・見積もり・方式確定は未実施。まずどの段階から着手するかを選ぶ。

## 8. 検証と調査の境界

実施:

- trunk から workspace を作成。default の既存 Pi 変更は移さず、変更しない。
- `fd` / `rg` によるファイル・呼び出し元・設定・文書の棚卸し。
- `ast-grep` による `Deno.*` / `Deno.test(...)` の構文検索。
- Firecrawl + agy + Grok X Search による公開情報の確認。Node の仕様はローカルと同じ v24.12.0 の公式文書で確認。
- 初回の Node 比較として `stripTypeScriptTypes` による本番53ファイルの strip 診断、53/53成功。
- Bun 1.3.13 で既存 TS 4モジュールの import、互換 API の解決、pure function 2件の smoke check を確認。
- Bun.spawn で Web Stream stdout と非0終了コード7を確認。timeout/signal group cleanup は未確認。
- Bun の `node:module.stripTypeScriptTypes` 未提供と `vm.SourceTextModule` のインスタンス生成を確認。

未実施:

- skill CLI の Deno API 置換と、それらの Bun での統合動作確認。Pi の `*.test.ts` はこの文書の後に Bun へ移し、127 件の実行を確認した。
- インストール、launchd/cron の変更、push/PR。
- 他の ghq リポジトリ、ホーム全体、実稼働サービスの棚卸し。結論はこの dotsfile の追跡コード・設定の範囲。
- denops/dpp そのものの移行調査。該当の URL import は今回対象外。

診断上の注意: `node --check` を試した際の TS エラーは移行不能の証拠ではない。v24.12.0 の公式仕様では `--check` は TS 非対応のため、その結果を採用せず type stripping API で診断し直した。

## 出典

1. [Deno is joining Cloudflare, 2026-10-09](https://deno.com/blog/cloudflare)
2. [Cloudflare 共同発表, 2026-10-09](https://blog.cloudflare.com/deno-joins-cloudflare/)
3. [Node.js v24.12.0: TypeScript](https://nodejs.org/download/release/v24.12.0/docs/api/typescript.html)
4. [Node.js v24.12.0: Permissions](https://nodejs.org/download/release/v24.12.0/docs/api/permissions.html)
5. [Node.js v24.12.0: Test runner](https://nodejs.org/download/release/v24.12.0/docs/api/test.html)
6. [Deno 公式 X 投稿](https://x.com/deno_land/status/2108543358197207048) — Grok X Search の引用、製品別の期限の根拠としては使わない。
7. [Bun: Node.js Compatibility](https://bun.com/docs/runtime/nodejs-compat) — 最新版の表であり、ローカル1.3.13の全機能を保証しない。
8. [Bun: Spawn](https://bun.com/docs/runtime/child-process)
9. [Bun: TypeScript](https://bun.com/docs/runtime/typescript)
10. [Bun: Test runner](https://bun.com/docs/test)

Bun の追加調査も Firecrawl + agy + Grok X Search で実施。agy の「drop-in」という表現は採用せず、Deno API と permissions の差を個別に確認した。

取得結果は workspace の ignored `.firecrawl/` に保存。調査・代替案の記録は read-only advisor 用の `plans/research/` に置き、実装用の個別計画とは分けた。
