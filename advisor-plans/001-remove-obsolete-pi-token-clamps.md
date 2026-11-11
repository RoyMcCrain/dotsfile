# Plan 001: Pi 本体と重複する出力トークン補正を撤去する

> **実行者への指示**: この計画を最後まで読み、各手順の検証結果を確認してから次へ進む。STOP 条件に該当したら独断で範囲を広げず報告する。完了後は `advisor-plans/README.md` の状態を更新する（親エージェントが管理すると指定された場合を除く）。
>
> **最初の drift check**:
>
> ```bash
> jj diff --from d143f5e013e07c3da7c9f4b6dbad4f5131900d67 --to @ --stat -- pi/agent/extensions/clamp-openai-output-tokens.ts scripts/build_env/patch_pi_min_output_tokens.sh scripts/build_env/setup.sh scripts/tests/setup.bats devbox/devbox.json pi/README.md
> ```
>
> 対象に変更があれば、以下の現状抜粋と実コードを比較する。不一致を説明できなければ停止する。

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW（対象 runtime の組み込み補正を確認できる場合）
- **Depends on**: なし。Plan 002 と独立
- **Category**: tech-debt
- **Planned at**: base commit `d143f5e013e07c3da7c9f4b6dbad4f5131900d67`, 2026-11-11
- **Status**: DONE（2026-11-11、実装・親検証済み。詳細は `advisor-plans/README.md`）

## Why this matters

Pi 1.5.2 は OpenAI Responses の `max_output_tokens` を最低16へ補正する。本リポジトリには同じ補正を行う拡張と、インストール済み依存ファイルを書き換える旧パッチが残っている。旧パッチは npm global 配下を対象とするが、調査環境で実行される Pi は managed install 配下であり、通常セットアップが存在しないパッチ対象へ依存する原因にもなる。

目的は補正を Pi 本体へ一本化し、不要なイベントフック・依存ファイル改変・セットアップ依存をなくすこと。API の下限を変更したり、出力上限や compaction 設定を変更する計画ではない。保証の根拠は確認済みの Pi 1.5.2 であり、未確認の旧版まで動作保証を広げない。

## Current state

- `pi/agent/extensions/clamp-openai-output-tokens.ts:10` は `before_provider_request` で下限を補正する。

  ```ts
  const maxOutputTokens = event.payload.max_output_tokens;
  if (typeof maxOutputTokens !== "number") return;
  if (!Number.isFinite(maxOutputTokens)) return;
  if (maxOutputTokens >= MIN_OPENAI_OUTPUT_TOKENS) return;

  return {
    ...event.payload,
    max_output_tokens: MIN_OPENAI_OUTPUT_TOKENS,
  };
  ```

- `scripts/build_env/patch_pi_min_output_tokens.sh:4` は次のファイルを改変する。

  ```bash
  PI_SIMPLE_OPTIONS="$(npm root -g)/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/api/simple-options.js"
  ```

  改変内容は `const MIN_MAX_TOKENS = 16;` への置換。
- `scripts/build_env/setup.sh:128` は npm の存在だけで旧パッチを実行する。

  ```bash
  if command -v npm >/dev/null 2>&1; then bash "$BASE_DIR/scripts/build_env/patch_pi_min_output_tokens.sh"; fi
  ```

- `scripts/tests/setup.bats:61` はこのパッチの成功スタブを fixture に生成し、そのファイルを `chmod` 対象にも含めている。このスタブが、パッチへの不要な依存を隠している。
- `devbox/devbox.json` の `.shell.scripts["setup-npm"]` は Pi の npm install の後に旧パッチを呼ぶ。
- `pi/README.md:19-25` は旧パッチの実行手順、`:409` は補正拡張を案内している。
- `pi/agent/settings.json` の `extensions/*.ts` でこの拡張が有効になる。設定 glob と他の拡張は変更不要。

### Runtime の裏取り済み事実

調査時の実行ファイルは `~/.pi/agent/bin/pi`、managed version は `1.5.2`。その runtime の `@earendil-works/pi-ai/dist/api/` には次がある。

- `openai-responses.js:17,269`: 定数16と `Math.max(options.maxTokens, OPENAI_RESPONSES_MIN_OUTPUT_TOKENS)`。
- `azure-openai-responses.js:16,153`: 同じ下限補正。
- `stream` と `streamSimple` に `maxTokens: 1` を渡すオフライン確認は、両方とも payload が16、ネットワーク呼び出し0回だった。

`pi/agent/package.json` のローカル SDK は `0.83.0`。これを現行 runtime と混同しない。この計画で SDK や lockfile は更新しない。

### Conventions

- `.jj` があるため VCS 操作は `jj` を使う。
- JSON の操作は `jq`、探索は `fd`、検索は `rg` を使う。
- セットアップの挙動確認は `scripts/tests/setup.bats` の private HOME / fixture repo を使う。実 HOME に対する `setup.sh` は実行しない。
- ドキュメントの文面を固定するテストは追加しない。既存セットアップテストの fixture から不要なスタブを外して実行経路を守る。
- 非自明な実装は `impl` skill の role `impl.default` へ委譲し、親が diff・lint・tests・仕様充足を確認する。実装前に現行 Pi の関連 docs/examples を読む。

## Commands you will need

| 用途 | コマンド | 期待結果 |
| --- | --- | --- |
| 状態確認 | `jj status; jj log -r @` | 割り当てられた変更と既存差分を確認できる |
| セットアップテスト | `bats scripts/tests/setup.bats` | 全成功。調査時は11件 |
| shell lint | `shellcheck scripts/build_env/setup.sh` | exit 0 |
| shell format | `shfmt -d scripts/build_env/setup.sh` | 差分なし、exit 0 |
| JSON 検証 | `jq -e '.shell.scripts["setup-npm"] | type == "string"' devbox/devbox.json` | `true`、exit 0 |
| 既存 typecheck | `pi/agent/node_modules/.bin/tsc -p pi/agent/tsconfig.json` | exit 0。ただし既存設定の対象は `tests/assert.ts` のみ |
| 全体検証 | `bash scripts/run_tests.sh` | フォアグラウンドで実行し `All tests passed.` |

依存ツールは調査時に存在していた。欠落していた場合は報告する。実行者の判断で npm global install、依存更新、Pi update は実行しない。

## Scope

**変更してよいファイル**:

- `pi/agent/extensions/clamp-openai-output-tokens.ts` — 削除
- `scripts/build_env/patch_pi_min_output_tokens.sh` — 削除
- `scripts/build_env/setup.sh` — 旧パッチ呼び出しの削除のみ
- `scripts/tests/setup.bats` — 旧パッチ fixture と対応する `chmod` 引数の削除のみ
- `devbox/devbox.json` — `setup-npm` の末尾パッチ呼び出しの削除のみ
- `pi/README.md` — 旧パッチ手順と補正拡張の案内を削除し、現行版の組み込み補正へ説明を合わせる
- `advisor-plans/README.md` — この計画の状態・検証結果

**変更禁止**:

- `pi/agent/settings.json`、compaction・retry・モデル設定
- `pi/agent/package.json`、`bun.lock`、`devbox.lock`、Pi 本体・`node_modules/**`
- 他の拡張、resolver、メモリ実装、共有 skill
- `~/.pi/**`、認証情報、ユーザーの実セットアップやインストール状態

## Git workflow

割り当てられた workspace/revision 内で作業する。別 PR を求められていないので bookmark を増やさない。push 済み revision なら追記せず `jj new` で積む。コミットメッセージを設定する場合は `JJ_EDITOR=true jj describe -m "Pi 本体と重複する出力トークン補正を撤去する"` を使う。push・PR 作成・merge は実施しない。

## Steps

### Step 1: Runtime の前提と baseline を確認する

1. drift check と `jj status` を実行する。
2. 実際に使用する Pi の版・インストール先を確認する。managed install なら `~/.pi/agent/install/current-version` から特定できる。
3. 現行 runtime の OpenAI / Azure Responses に下限16の補正があることを確認する。調査済みの大きな vendor ファイルを丸ごと再読せず、既知の根拠や該当箇所を使う。
4. 次のオフライン検証を行う。これは新規の永続テストファイルにせず、対象 runtime の確認に使う。実際の `/compact` による AI 呼び出しは不要。

```bash
runtime_root="$HOME/.pi/agent/install"
IFS= read -r runtime_version < "$runtime_root/current-version"
PI_AI_API_DIR="$runtime_root/releases/$runtime_version/node_modules/@earendil-works/pi-ai/dist/api" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { stream, streamSimple } = await import(pathToFileURL(join(process.env.PI_AI_API_DIR, 'openai-responses.js')).href);
const model = {
  id: 'offline-audit', name: 'Offline audit', provider: 'openai',
  api: 'openai-responses', baseUrl: 'http://127.0.0.1:1/v1',
  reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 1,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const context = { messages: [{ role: 'user', content: 'Offline construction check', timestamp: 0 }] };
for (const [name, request] of [['stream', stream], ['streamSimple', streamSimple]]) {
  let captured;
  let networkCalls = 0;
  const events = request(model, context, {
    apiKey: 'sk-offline-test-only', maxTokens: 1, maxRetries: 0,
    onPayload: payload => { captured = payload; throw new Error('OFFLINE_AUDIT_STOP'); },
    fetch: async () => { networkCalls++; throw new Error('NETWORK_MUST_NOT_BE_USED'); },
  });
  for await (const event of events) { /* Drain the intentional local failure. */ }
  assert.equal(captured?.max_output_tokens, 16);
  assert.equal(networkCalls, 0);
  console.log(`${name}: max_output_tokens=16, networkCalls=0`);
}
NODE
```

**Verify**: 上のコマンドは exit 0 で2行を出力する。続けて `bats scripts/tests/setup.bats` は全成功する。managed install 以外ならパスを勝手に決めず、実際の runtime を特定してから同等確認を行う。

### Step 2: 不要なパッチ依存を既存テストで Red にする

`scripts/tests/setup.bats` から旧パッチの heredoc スタブを取り除き、`chmod +x` は `"$BIN"/*` のみを対象とする。npm のスタブは残す。source のセットアップはまだ変更しない。

**Verify**:

```bash
bats --filter '^fresh setup delivers Codex native overrides' scripts/tests/setup.bats
```

旧パッチファイルが fixture にないためセットアップが失敗すること。意図した missing patch 以外の理由なら先へ進まない。ユーザー実 HOME での失敗再現は禁止。

### Step 3: 呼び出し元と実装を撤去して Green にする

1. `setup.sh` の旧パッチ呼び出しを削除する。他のセットアップ処理は保持する。
2. `devbox/devbox.json` は `jq` で対象 script の値を確認・変換し、その結果だけを対象文字列へ局所反映する。`setup-npm` 末尾の `&& bash $(ghq root)/.../patch_pi_min_output_tokens.sh` だけを取り除き、Pi の install オプションと他のパッケージは変更しない。JSON 全体を書き戻して再整形せず、差分を対象値だけに限定する。
3. 補正拡張と旧パッチスクリプトを削除する。設定 glob はそのままにする。
4. README の旧手順・旧説明・拡張一覧の該当行を更新する。最低限の根拠は「確認済み Pi 1.5.2 は組み込み補正を持つ」とし、未検証の古い版にも安全だとは書かない。

**Verify**: `bats scripts/tests/setup.bats`、`shellcheck scripts/build_env/setup.sh`、`shfmt -d scripts/build_env/setup.sh`、上表の JSON 検証がすべて成功する。次の検索は exit 1（該当なし）、両ファイルの存在確認も成功する。

```bash
rg -n 'patch_pi_min_output_tokens|clamp-openai-output-tokens' pi scripts devbox --glob '!bun.lock'
test ! -e pi/agent/extensions/clamp-openai-output-tokens.ts
test ! -e scripts/build_env/patch_pi_min_output_tokens.sh
```

計画書内の履歴参照は検索対象外。

### Step 4: 全体検証と引き渡し

`bash scripts/run_tests.sh` をフォアグラウンドで実行し、差分を全行確認する。変更された shell 処理については `impl` skill の scoped cccc policy も適用する。削除主体の変更に新しい抽象化やバージョン判定は追加しない。

**Verify**: 全テスト成功、`jj diff --stat` / `jj diff` が Scope 内に収まり、Step 1 のオフライン確認も引き続き成功する。`advisor-plans/README.md` に結果を記録する。

## Test plan

- 新規の文章照合テスト・ソース検索テストは追加しない。
- 既存 `scripts/tests/setup.bats` を使い、npm が存在しても旧パッチなしで通常セットアップが完了する契約を検証する。
- Red は fixture から旧パッチスタブを外した段階、Green はセットアップから旧依存を外した段階で記録する。
- provider の下限16は、実行対象 runtime のオフラインリクエスト構築で確認する。ローカル SDK 0.83.0 に対する検証に置き換えない。

## Done criteria

- [x] Step 1 のオフライン確認が成功し、ネットワーク呼び出しは0回
- [x] fixture 変更後の Red と実装変更後の Green を記録した
- [x] `bats scripts/tests/setup.bats` が全成功
- [x] shellcheck、shfmt、JSON 検証が成功
- [x] `bash scripts/run_tests.sh` が `All tests passed.`
- [x] `pi scripts devbox` 内の旧パッチ・旧拡張参照がなく、対象2ファイルが存在しない
- [x] `jj diff` は Scope 内のみ。runtime・認証情報・モデル設定は未変更
- [x] `advisor-plans/README.md` の状態更新済み

## STOP conditions

- 対象マシンで古い Pi の維持が必要、または実 runtime に組み込み補正がない。
- オフライン確認が16を生成しない、またはネットワーク呼び出しを試みる。
- fixture の Red が旧パッチ欠落以外で失敗する。
- Scope 外の呼び出し元が見つかる、または依存更新が必要になる。
- 検証が妥当な修正を試しても2回失敗する。既存の無関係な失敗は勝手に修正せず、baseline と併せて報告する。

## Maintenance notes

既知の旧版向け workaround を将来追加する場合は、先に実行対象 Pi の provider 実装を確認する。npm global と managed install のパスを混同しない。安全策を再導入するにしても汎用 `MIN_MAX_TOKENS` を全 provider 向けに書き換える方法へ戻さない。無効化済み拡張と resolver の旧レビュー経路整理はこの計画から明示的に除外する。
