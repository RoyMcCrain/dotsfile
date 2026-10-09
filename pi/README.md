# Pi Coding Agent config

`pi/agent` is intended to be linked to Pi's global config directory
(`~/.pi/agent`). Keep secrets out of this repository: use environment variables,
Bitwarden CLI commands, or `~/.pi/agent/auth.json`.

## Install

Pi is installed by the global devbox npm setup:

```bash
devbox global run setup-npm
```

Manual install:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
./scripts/build_env/patch_pi_min_output_tokens.sh
```

The patch avoids OpenAI Responses API errors where Pi sends
`max_output_tokens < 16` during a near-full compaction request. Restart Pi after
patching; `/reload` only reloads extensions and does not reload Pi's core
`node_modules`.

## Link this config

The dotfiles setup scripts link the tracked files into `~/.pi/agent` without
touching `auth.json`. `pi/agent/AGENTS.md` is Pi's global context file:

```bash
./scripts/build_env/setup_fish.sh
```

For one-off testing without symlinks:

```bash
PI_CODING_AGENT_DIR=$PWD/pi/agent pi --list-models
PI_CODING_AGENT_DIR=$PWD/pi/agent pi
```

## Shift+Enter (WSL / Windows Terminal)

Mac Ghostty sends Kitty keyboard protocol for `Shift+Enter`, so pi inserts a
newline. Windows Terminal does not, unless you remap it.

In Windows Terminal `settings.json` (`Ctrl+Shift+,` → Open JSON file), bind
`shift+enter` to Kitty CSI u `ESC[13;2u`:

```json
{
  "command": { "action": "sendInput", "input": "\u001b[13;2u" },
  "keys": "shift+enter"
}
```

Do **not** send `\u001b\r` (ESC+CR). Pi treats that as a different chord, so
`Shift+Enter` will not insert a newline.

Windows Terminal usually reloads `settings.json` automatically. If it does not,
fully close and reopen the terminal. Fallback without this remap: `Ctrl+J`.

## Model setup

Use Pi's built-in subscription flow when possible:

```text
/login
/model
```

The default model is stored in `settings.json` (`defaultProvider` /
`defaultModel`). Pi rewrites those keys whenever you switch with `/model`, so
treat them as runtime state, not as configuration to hand-edit.

### Model roles (single source of truth)

Model IDs change often, so skills and review runners never hardcode them. They
reference **roles** defined in `pi/agent/model-roles.json`:

```bash
~/.pi/agent/resolve-model.sh --list                      # role -> model id -> label
~/.pi/agent/resolve-model.sh review.codex                 # -> Pi model id
~/.pi/agent/resolve-model.sh impl.default                 # -> Pi implementation model id
~/.pi/agent/resolve-model.sh --field cursor ROLE          # -> Cursor Agent model id (compatibility)
~/.pi/agent/resolve-model.sh --field agy review.antigravity # -> Antigravity model id
~/.pi/agent/resolve-model.sh --field id route.review       # -> Jev OpenRouter model id (parallel-review auto)
~/.pi/agent/resolve-model.sh --review-level 3              # -> backend/model/timeouts TSV (L3 / auto fallback tier)
~/.pi/agent/resolve-model.sh --label review.grok
~/.pi/agent/resolve-model.sh --apply                      # sync derived config
~/.pi/agent/resolve-model.sh --check                      # verify nothing drifted
```

Set `OPEN_ROUTER_API_KEY` in the environment for parallel-review **auto** selection (`select_review_level.ts` reads only that variable; explicit `1..5` skips Jev). One auto routing Decisions operation (same payload; up to 3 `http_error`-only HTTP retries with abortable 250ms/500ms/1s default waits or `Retry-After`, 4 attempts max, one shared 15s total deadline including waits) classifies **review depth** and **chunk plan** (`chunking.choice`: `none` or decimal-byte targets `12000` / `24000` / `48000`; independent confidence) from the sanitized patch and optional secret-screened routing context (`review-context.json`; reviewers still receive patch only). Explicit levels use offline fixed chunk thresholds (15KB or 400 newlines → `12000`, else `none`) and ignore context. Auto uses `route.review` plus scoped Deno permissions in `skills/parallel-review/SKILL.md` (`--allow-net=openrouter.ai:443`, `--allow-env=OPEN_ROUTER_API_KEY`). Unspecified review level → auto; depth failures fall back to **L3** (six fixed reviewers). Main Pi session model is unchanged.

Each run retains the suggested depth, confidence, threshold, applied level and
fallback reason in `metadata.json`; valid five-level probabilities are also saved
when Jev supplies them. Inspect these records offline, including unfinished runs:

```bash
deno run --no-config --allow-read --allow-env=HOME,XDG_DATA_HOME \
  "$HOME/.agents/skills/parallel-review/scripts/review_history.ts" decisions \
  --repository "$PWD"
```

The repository filter matches the stored path exactly. Confidence is not measured
accuracy; repeated decisions for the same patch are not independent samples.
Thresholds are not automatically adjusted and old records are not rewritten.

Current roles: `review.codex`, `review.claude`, `review.grok`, `review.antigravity`,
`review.fugu`, `review.muse`, `route.review`, `route.fugu.base`, `route.fugu.ultra`, `impl.default`,
`research.xai`, `codex.default`.

To move to a new model version, update `model-roles.json` (role model IDs,
`reviewLevels` tier models, role labels, and the `enabledModels` cycling list),
then run `--apply` and `--check`. Skills pick it up immediately because
`run_pi_review.sh --role ROLE` resolves Pi models through the same catalog.
`run_antigravity_review.sh --role review.antigravity` resolves via `--field agy`.
Parallel-review tiers resolve from `--review-level N` (L1 **1–2** rows, L2 **2–3** after
caller-vs-fixed dedupe; L3–L5 fixed six rows)
(`backend<TAB>model<TAB>initial<TAB>retry`; backends `pi` or `agy`). L1/L2 take the runtime
caller from `PI_PROVIDER`/`PI_MODEL` (optional `PI_REASONING_LEVEL`) or `--current-model`
/`--current-backend`; explicit flags override Pi env. All tiers include Muse Contributor
:high with tier timeout budgets (not the standalone 120s).
Parallel-review Codex slots: L3 uses **GPT-6.1 Sol** (`:xhigh`); L4 and L5 use **GPT-6 Astra**
(`:max`). Standalone `codex-review` and role `review.codex` stay on Astra (`:high`); `codex.default`
remains Astra. L1/L2 still review with the runtime caller model, not a fixed Codex tier id.
Install the Antigravity `patch-reviewer` agent via setup scripts before using the agy runner.

`enabledModels` controls Pi's Ctrl+P cycling choices (configured with
`/scoped-models`); it is not an allowlist for `--model` or skill role resolution. Role and tier
models live in `roles` and `reviewLevels`.

`modelOverrides` in `models.json` are keyed by the exact model ID from
`codex.default`. When migrating, update the override key to match the new
catalog model and keep an intentional 372K context preference only after
confirming the target supports it; `--apply` does not sync `modelOverrides`.
Regression tests in `resolve-model.bats` guard against losing the override.
Pi auto-compacts when `contextTokens > contextWindow - reserveTokens`; with
372K and the current 50K reserve that threshold is above 322K (1M would be
above 950K, not a fixed 200K).

`--apply` / `--check` cover the config files that cannot expand variables:

| Target                                     | Key             | Source role / field |
| ------------------------------------------ | --------------- | ------------------- |
| `pi/agent/settings.json`                   | `enabledModels` | `enabledModels`     |
| `~/.codex/config.toml` (local, app-owned)  | `model`         | `codex.default.id`  |

Codex config ownership:

- Live config lives at `${CODEX_HOME:-$HOME/.codex}/config.toml` as a regular
  local file. `CODEX_CONFIG_FILE` overrides that path for resolver tooling;
  `CODEX_HOME` overrides the default directory when `CODEX_CONFIG_FILE` is unset.
- Curated manual defaults are in `codex/config.toml.example` (no `model` key).
  `scripts/build_env/setup_codex_config.sh` initializes the live file only when
  missing: it prepends `model` from `roles["codex.default"].id`, then appends
  the template. Existing files are never overwritten; reruns are idempotent.
- Any machine still using the legacy repo symlink must detach **before**
  checkout/pull/rebase that deletes tracked `codex/config.toml`. Untracking keeps
  the file only in the author workspace (via `.gitignore`); consumer checkouts
  lose the tracked file and leave a dangling `~/.codex/config.toml` link if not
  migrated first. Tracked contents remain recoverable from VCS history; do not
  replace old settings with template defaults.
- Legacy migration is **explicit**, never automatic during normal setup. Stop all
  Codex apps, CLIs, and other config writers first; the helper lock serializes
  helper invocations only (apps that ignore the lock can still race). Normal
  setup refuses a known legacy symlink with an error; run `--migrate-legacy`
  only after writers are quiescent. Unrelated symlinks are left alone; broken
  links and directories fail with actionable recovery guidance.
- **Pre-update migration** (run from repo root while still on old code; choose a
  revision that contains the migration helper, e.g. `main@origin` after merge):

```bash
(set -euo pipefail
  umask 077
  codex_home="${CODEX_HOME:-$HOME/.codex}"
  config="${codex_home}/config.toml"
  workdir="$(mktemp -d /tmp/codex-migrate.XXXXXX)"
  backup="${workdir}/config-backup.toml"
  helper="${workdir}/setup_codex_config.sh"
  trap 'rm -f "$helper"' EXIT
  cp -L "$config" "$backup"
  chmod 600 "$backup"
  jj git fetch
  jj file show -r 'main@origin' scripts/build_env/setup_codex_config.sh >"$helper"
  [[ -s "$helper" ]]
  bash "$helper" --migrate-legacy "$PWD"
  [[ -f "$config" && ! -L "$config" ]]
  cmp -s "$config" "$backup"
  echo "backup kept at $backup (private directory $workdir; remove when done)"
)
```

  Only after the block succeeds, update the checkout. Do not run it against a real HOME unless
  you intend to migrate; back up outside the repo at mode 600 and verify the
  resulting regular file matches the backup only after the helper succeeds.
- **Already updated with a broken link:** normal setup fails safe. Restore from
  the pre-update backup, or extract a known old revision's config into a
  separate recovery file for inspection (`jj file show -r OLD_REV codex/config.toml`),
  then restore your local regular file. Never silently reinitialize from template.
- **Stale lock** at `${CODEX_HOME:-$HOME/.codex}/.config-setup.lock`: confirm no setup helper
  is active and all Codex config writers are stopped, then remove the empty
  lock directory.
- Run the helper standalone: `bash scripts/build_env/setup_codex_config.sh`
  (optional `--migrate-legacy`, optional repo-root argument; default derives from
  script location). Setup entrypoints invoke the same helper without
  `--migrate-legacy`.

`defaultProvider` / `defaultModel` in `settings.json` are intentionally *not*
managed, because Pi rewrites them at runtime when you switch with `/model`.
Run `--check` after editing the catalog to catch drift.

Tracked custom providers:

- `lm-studio/*` (dynamically loaded from `LM_STUDIO_BASE_URL` or
  `http://localhost:1234/v1`)

**Fugu (Sakana) — active.** The `sakana-ai-console` provider serves
`fugu-max` (base, everyday) and `fugu-ultra-v2.0` (ultra, deep review).
`review.fugu` → `fugu-ultra-v2.0:high` (timeout 240s). `parallel-review` L3/L4
use Fugu Max :high; L5 adds Fugu Ultra v2 :high; L1/L2 have no **fixed**
Fugu slot (the runtime caller may still be Fugu). Legacy pre-reactivation
snapshot: `pi/agent/fugu.disabled.json.example` (obsolete IDs — do not merge).

**Local caps** (deliberate Pi operational limits; Sakana's setup catalog lists
`context_window` 1000000 for Max and Ultra v2, and Codex `codex/fugu.json`
matches that 1M value):
`contextWindow` 300000 and `maxTokens` 32768 (Max) / 8192 (Ultra v2) in
`models.json`.

After editing the catalog:

1. Run `./pi/agent/resolve-model.sh --apply` and `--check`.
2. Restart Pi (full restart is simplest; `/reload` may suffice for catalog-only
   changes).
3. Select `sakana-ai-console/fugu-max:high` or `fugu-ultra-v2.0:high` via
   `/model`, then run `/auto-fugu on` — manual `/model` selection disables
   automatic routing until you re-enable it or start a new session.

Built-in subscription providers (via `/login`):

- `anthropic/*` — Claude Pro/Max OAuth (built into Pi; no extra package)

`enabledModels` lists models consumed by Pi itself (including implementation role
`impl.default`, default GPT-6 Luna High). Implementation runs via isolated headless
Pi (`skills/impl/scripts/run_impl.sh`), not the main session model.

Environment variables:

```bash
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"  # Optional
export LM_STUDIO_API_KEY="..."           # Optional; dummy key is used if unset
```

### Sakana API key

Pi resolves `sakana-ai-console` credentials from `~/.pi/agent/auth.json`
(no API key in tracked `models.json`). If `auth.json` is missing, copy the
example once:

```bash
cp pi/agent/auth.json.example ~/.pi/agent/auth.json
chmod 600 ~/.pi/agent/auth.json
```

Do **not** overwrite an existing `auth.json`. The example expects a generic
password item named `fugu-api-key`:

```bash
security find-generic-password -w -s fugu-api-key >/dev/null
```

If you do not want to use Keychain, edit `~/.pi/agent/auth.json` and store a
literal API key or an environment reference such as `$SAKANA_API_KEY`.

### OpenCode Go API key

Pi ships a built-in `opencode-go` provider (distinct from OpenCode Zen /
`opencode`). No custom provider, endpoints, or model catalog are tracked here;
`enabledModels` uses the `opencode-go/*` glob so bundled model IDs stay in sync
with Pi.

1. Unlock Bitwarden if needed, then sync the Keychain item (fish uses the default
   env var derived from the item name):

   ```bash
   bw-unlock   # if BW_SESSION is unset
   sync-key open-code-go-api-key
   ```

2. Add or merge the `opencode-go` command entry into `~/.pi/agent/auth.json`
   without overwriting other credentials (copy from `pi/agent/auth.json.example`
   if helpful):

   ```json
   "opencode-go": {
     "type": "api_key",
     "key": "!security find-generic-password -w -s open-code-go-api-key"
   }
   ```

   Avoid the shared `OPENCODE_API_KEY` environment variable here; both Go and
   Zen use it. The provider-scoped entry keeps this key limited to Go.

3. Restrict permissions and restart Pi:

   ```bash
   chmod 600 ~/.pi/agent/auth.json
   ```

4. Verify readiness:

   ```bash
   pi auth check --provider opencode-go --json
   pi --list-models opencode-go
   ```

   In an interactive session, `/model` and search for `opencode-go` to pick a
   model.

### Claude Pro/Max (`anthropic`)

Pi 0.84+ includes Claude Pro/Max OAuth. No `pi-anthropic-oauth` package is
required. Third-party harness usage draws from
[extra usage](https://claude.ai/settings/usage) and is billed per token, not
against Claude plan rate limits.

```bash
pi --list-models anthropic
pi --model anthropic/claude-sonnet-4-6
```

Auth (pick one):

1. Preferred: already logged in via Claude Code, then sync Keychain tokens:

   ```bash
   ./scripts/build_env/sync_pi_claude_auth.sh
   ```

2. Or inside pi: `/login` → **Anthropic (Claude Pro/Max)** (browser PKCE OAuth)

Check readiness:

```bash
pi auth check --provider anthropic --json
```

### Implementation delegation (`impl` skill)

Non-trivial implementation delegates to an **isolated headless Pi child** (no parent
settings/skills/context). The caller prepares the prompt and validates afterward.

```bash
~/.pi/agent/resolve-model.sh impl.default
pi auth check --provider openai-codex --json
bash "$HOME/.agents/skills/impl/scripts/run_impl.sh" --prompt /tmp/impl-prompt.md --cwd "$PWD"
```

- `impl.default` → GPT-6 Luna High; comparison roles `impl.deepseek`, `impl.haiku` (same catalog, `--role` per run)
- Change models by editing `model-roles.json` roles only (not skills/runners)
- Run metrics persist under `~/.local/share/impl/runs` (or `IMPL_RUNS_DIR` / `run_impl.sh --runs-dir`); offline report:

```bash
deno run --no-config --allow-read --allow-env --allow-write="$TMPDIR/impl-report-out" \
  "$HOME/.agents/skills/impl/scripts/impl_history.ts" report \
  --out "$TMPDIR/impl-report-out"
```

- Offline reports show per-metric slice denominators (known/expected) and honest partial cost subtotals; JSON `caseKey` is the full grouping identity (HTML uses a short label). CLI rejects duplicate flags and extra positional args. `running` runs must omit elapsed/exit/finished in stored metadata.
- `executionStatus: completed` ≠ tests passed; record parent validation:

```bash
deno run --no-config --allow-read --allow-write="$RUN_DIR" \
  "$HOME/.agents/skills/impl/scripts/impl_history.ts" set-validation \
  --run "$RUN_DIR" --status passed
```
- Deprecated alias skill: `cursor-impl` (`/skill:cursor-impl`) — follow `impl` canonical docs

Isolation is **not** a filesystem sandbox; scope work via the prompt.

## Extensions

Configured by `settings.json` via `extensions/*.ts` and npm packages.

| Extension / package             | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `local-openai.ts`               | Auto-register LM Studio models from `LM_STUDIO_BASE_URL` at startup. |
| `clamp-openai-output-tokens.ts` | Clamp normal OpenAI payloads to the minimum `max_output_tokens = 16`. |
| `codex-usage.ts`                | Show ChatGPT Codex plan usage and reset time in Pi's footer. Refresh with `/codex-usage`. |
| `openrouter-balance.ts`         | Show OpenRouter prepaid balance in Pi's status bar. Refresh with `/openrouter-balance`. |
| `auto-fugu-model.ts`            | Route everyday work on `fugu-max`; auto-escalate to `fugu-ultra-v2.0` when on the Fugu pair. Toggle with `/auto-fugu on\|off\|status`. |
| `cmux-session-name.ts`          | Sync unnamed Pi session names from the caller cmux workspace `custom_title` for `/resume` search. |
| `workspace-cd.ts`               | Fork/switch Pi session cwd after jj workspace setup (`switch_workspace_cwd` tool, `/workspace-cd`). |
| `save-compaction-log.ts`        | Save compaction summaries to `~/.pi/agent/compaction-logs/`.         |
| `repo-memory-local.ts`          | Local-only repo memory: `recall_memory` / `remember` / `review_memory` tools + `/repo-memory-review` command. |

Reload after editing extensions:

```text
/reload
```

### Codex plan usage

`codex-usage.ts` keeps Pi's built-in footer and adds a compact status such as
`Codex Pro 7d 0% ↻08/25 14:57` while an `openai-codex` model is selected. It
reads the subscription quota through the locally authenticated `codex
app-server`, so Codex CLI must be installed and logged in.

Usage refreshes at session start, after model switches, and after each settled
agent run. Run `/codex-usage` to force a refresh; automatic failures stay silent
and clear stale status.

### OpenRouter prepaid balance

`openrouter-balance.ts` adds a compact TUI status such as `OpenRouter $12.34`
via the extension status bar (alongside Codex usage and other statuses). It is
shown in TUI mode regardless of the selected main model, because Jev and other
flows still use OpenRouter when the primary provider is not OpenRouter.

The balance comes from OpenRouter's management API (`GET /api/v1/credits`), not
from the inference key (`OPEN_ROUTER_API_KEY`).

**Credential flow (Bitwarden → Pi):**

1. Store the management key in Bitwarden as the password item
   `open-router-management-key` (same folder convention as other env keys).
2. In a **fish** shell, unlock Bitwarden if needed, then run **`sync-key`**
   (fish function — not bash):

   ```fish
   bw-unlock   # if BW_SESSION is unset
   sync-key open-router-management-key
   ```

   `sync-key` pulls the password from Bitwarden, writes it to macOS Keychain
   (`security add-generic-password -s open-router-management-key`), and exports
   `OPEN_ROUTER_MANAGEMENT_KEY` in the **current** fish session.
3. On every new fish startup, `config.fish` reads that Keychain item and
   `set -gx OPEN_ROUTER_MANAGEMENT_KEY …` (item name → env name:
   `open-router-management-key` → `OPEN_ROUTER_MANAGEMENT_KEY`).
4. Start or **fully restart** Pi from that fish session so the process inherits
   the variable. Pi loads `openrouter-balance.ts` automatically via
   `settings.json` → `extensions: ["extensions/*.ts"]` (repo symlink under
   `~/.pi/agent/extensions`); no extra settings entry is required after adding
   the file.

**`/reload` limits:** `/reload` reloads extensions and other Pi resources, but
it does **not** re-read the parent shell environment. If you `sync-key` or export a new
`OPEN_ROUTER_MANAGEMENT_KEY` after Pi is already running, quit Pi and start it
again from the fish session that has the key — `/reload` alone will not pick up
the new value.

Usage refreshes at session start and after each settled agent run. Run
`/openrouter-balance` to force a refresh. Automatic failures stay silent and
clear stale status; manual refresh shows a short Japanese message on failure.
Print, JSON, and RPC modes do not call the API. TUI without UI (`hasUI: false`)
also skips the API.

### Fugu model routing

`auto-fugu-model.ts` keeps `fugu-max` as the everyday model and promotes to
`fugu-ultra-v2.0` only when preflight rules or in-run struggle signals warrant
it. Routing operates **only when already on the Fugu pair** — it does not switch
from Codex/GPT or other providers. PR creation stays on base (Max). Manual
Manual `/model` selection disables automatic routing until `/auto-fugu on` or a
new session (full Pi restart also clears the override). Role IDs:
`route.fugu.base` → `fugu-max`, `route.fugu.ultra` → `fugu-ultra-v2.0`.

### cmux session names

`cmux-session-name.ts` gives unnamed Pi sessions a display name from the caller
cmux workspace's **custom title** (`custom_title` only — not the generated
`title` such as `π - dotsfile`). This makes `/resume` searchable for sessions
started via `/skill:jj-workspace` or other cmux task workflows.

The sync runs on `session_start` (workspace already renamed before Pi starts)
and once on the first `agent_settled` (common case where the agent renames the
workspace during the first task). Each extension instance performs at most two
cmux lookups total (startup plus first settled). Later `agent_settled` events do
not query cmux again. Lookups are serialized so subprocesses never overlap.

It scopes to `CMUX_WORKSPACE_ID`, queries `cmux workspace list --json`
non-interactively via `pi.exec` (preferring `CMUX_BUNDLED_CLI_PATH`), and calls
`pi.setSessionName()` with the normalized custom title.

An automatic name assigned at startup can update once after the first task when
the workspace `custom_title` changes. Existing manual Pi session names are
preserved: a non-empty name that differs from the extension's last auto-assigned
name is treated as manual (including resumed/stored session names). The
extension re-checks after the async cmux lookup so a concurrent manual name is
never overwritten. Custom titles are normalized before use: C0/C1 control
characters are replaced with spaces, whitespace runs collapse to a single space,
and the result is capped at 120 Unicode code points. Failures (missing cmux,
timeout, malformed JSON, missing workspace/custom title) fail silently.

### workspace cwd switch

`workspace-cd.ts` moves a **persisted** Pi session into another directory without
losing conversation history. A child shell cannot change Pi's cwd, so the
extension forks the current session with `SessionManager.forkFrom()` and switches
to the fork via `ctx.switchSession()`.

- **`switch_workspace_cwd` tool** — LLM-callable; used by `jj-workspace` as the
  **final tool** after workspace creation, setup, and cmux `custom_title`/description
  sync. Validates the destination path (`realpath`, must exist and be a directory),
  requires a persisted source session (`getSessionFile()`), stores the canonical target
  in extension-local state, returns `terminate: true`, and does **not** queue a follow-up
  message. After the current run `agent_settled` and Pi is idle, dispatches internal
  `/workspace-cd-continue <encoded-path>` with `expandPromptTemplates: true`. That
  command switches sessions in a fresh context and sends one short continuation message
  so the original task resumes in the new cwd automatically. Do not call any tools after
  it in the old session.
- **`/workspace-cd <path>`** — manual fork/switch without auto-continuation.
  Relative paths resolve from the current Pi cwd. Same cwd is a no-op.
- **`/workspace-cd-continue <encoded-path>`** — internal entrypoint dispatched after
  settlement by the tool; not for manual use. If `switchSession` is cancelled, the
  just-created fork session file is removed best-effort before surfacing the error.

Requires a persisted source session (`getSessionFile()`). In-memory sessions
cannot cross cwd; the tool throws `WorkspacePathError` before scheduling termination.
Command errors surface via Pi's extension error UI.

### Repo memory

`repo-memory-local.ts` stores durable, repo-specific notes **outside** the repo
(`~/.local/state/pi-repo-memory/<repo>-<hash>/memory.md`, `chmod 600`, never
versioned). A small index is injected at `session_start`.

- `recall_memory` — read saved notes (optional substring filter).
- `remember` — append one durable note (deduped; `[topic]` tag optional).
- `review_memory` — **agent-callable** consolidation tool. Saying e.g. 「メモリ整理して」
  triggers it: it rewrites `memory.md` in one LLM pass (using the current model)
  with a temporary `.bak` backup removed after a successful save.

The same consolidation is also available as a user slash command (interactive,
asks to confirm before overwriting):

```text
/repo-memory-review
```

Both paths consolidate `memory.md` in **one LLM pass** (dedupe, prune
obsolete/one-off items, regroup under `## <topic>` headings, each bullet ≤ 220
chars, timestamps dropped) and write a temporary `.bak` backup that is **removed
after a successful save** (retained if saving fails). The `review_memory` tool
overwrites directly (no confirm); the slash command asks to confirm and reports
before/after note counts. A cleanup failure after saving is reported as a success
with a warning, not a failed consolidation; an already absent backup is harmless.
The extension also nudges (session_start index) to consolidate once memory grows
past ~8KB.

Focused regression tests (Node 24):

```bash
node --experimental-vm-modules --test pi/agent/tests/repo-memory-local.node.test.mjs
```

`scripts/run_tests.sh` runs `*.node.test.mjs` with this Node flag and excludes them
from Deno test discovery. Pi Deno tests run with `--allow-env`, `--allow-sys=homedir`,
and `--allow-write` scoped to a dedicated temp directory (`TMPDIR` and
`PI_CODING_AGENT_DIR` overrides for that invocation only): no writes to real
`~/.pi` session state, and no `--allow-run` / `--allow-net` for the Pi suite.

## Skills

Do not duplicate shared skills under `pi/agent/skills/`. Pi discovers
`~/.agents/skills/` automatically.

### Single source of truth

Which skill directories are linked into `~/.agents/skills/` is defined by
`scripts/build_env/list_shared_agent_skills.sh`. It enumerates every immediate
directory under `skills/` (each must contain `SKILL.md`) plus Codex-native
overrides from `codex/skills/`. Both `create_symlink.sh` and `setup_fish.sh` call
it — adding a shared skill under `skills/` requires no inventory edit.

After changing skills, re-run your dotfiles setup (or link manually) so
`~/.agents/skills/` picks up the new symlinks.

### Canonical layout

| Location | Role |
| -------- | ---- |
| `skills/` | **Canonical shared skills** for Pi, Codex, Claude (via symlinks), and other agents |
| `claude/skills/` | Claude-only real skills (e.g. `crm-postmortem`) plus relative symlinks to `skills/` |
| `codex/skills/` | Codex-native overrides (`codex-review`, `mcp-delegate`) |

Shared skills must exist once under `skills/`. Root `skills/` is the canonical source and is intentionally not Pi's project-local `.agents/skills` discovery directory; setup exposes it globally under `~/.agents/skills/`. `claude/skills/` exposes
them to Claude Code via relative symlinks (never duplicate `SKILL.md` content).
Pi skill-collision warnings appear if both places hold real directories with the
same name. Shared `SKILL.md` files do not use host-specific `metadata.target_agent`;
exposure is controlled by which runtime directory links the skill.

### Pi skill inventory (by category)

**Review** (plain 「レビューして」 → `parallel-review` **auto** Jev level with optional routing context, L3 fallback):

単独の「レビューして」は preflight 後に `parallel-review` を即実行（Muse/Jev 送信の都度再確認不要。秘密検査・撤回/制限時の停止は従来どおり）。instructions/skills を手編集した既存 Pi セッションでは `/reload` で反映（upstream `docs/configuration.md` / `docs/skills.md`）。

| Skill | Trigger |
| ----- | ------- |
| `parallel-review` | 「レビューして」（単独） |
| `review-report` | 「レビューレポート作って」 |
| `implementation-report` | 「実装レポート作って」 |
| `review-verify` | 「裏取りして」 / verification パケット |
| `codex-review` / `claude-review` / `grok-review` | 単体 reviewer を明示指定時 |
| `fugu-review` | Fugu 単体 reviewer を明示指定時 |
| `muse-review` | Muse 単体 reviewer を明示指定時（`/skill:muse-review`）。Contributor は prompts/completions を学習利用（非 ZDR）。parallel でも全 tier に Muse が含まれる。単体 skill は明示時のみ（timeout 120s、`attempts=1`）。**個人設定によりユーザー依頼レビューの学習利用送信は常時許可済み**（patch ごとの再確認なし。秘密検査は必須）。role `review.muse`、`run_pi_review.sh` 再利用 |
| `hunk-review` | Hunk バンドル（devbox 同梱） |

**Implementation & PR**:

| Skill | Trigger |
| ----- | ------- |
| `impl` | 実装委譲（`/skill:impl`、隔離 Pi + `impl.default`） |
| `cursor-impl` | 非推奨 alias（`/skill:cursor-impl` → `impl` と同方針） |
| `cheap-pr` | 「PR 作って」等 |

**Workflow**:

| Skill | Trigger |
| ----- | ------- |
| `jj-workspace` | workspace 切り、Sentry 調査 |
| `mcp-delegate` | Slack/Sentry URL、OAuth MCP |
| `devin-wiki` | Devin Wiki 参照・`ask_question`（Claude 経由・読取専用） |

**Web research** (canonical under `skills/`):

| Skill | Invoke | Notes |
| ----- | ------ | ----- |
| `firecrawl` | `/skill:firecrawl` | source dir: `skills/firecrawl-cli` |
| `firecrawl-agent` | `/skill:firecrawl-agent` | structured extraction |
| `cross-research` | `/skill:cross-research` | Firecrawl + agy + Grok X Search 並列検証 |
| `antigravity-research` | `/skill:antigravity-research` | agy のみ（未検証サマリ） |

**cmux** (20 skills): `cmux`, `cmux-architecture`, … — all under `skills/`
and auto-discovered by `list_shared_agent_skills.sh`.

Model IDs for review/impl roles: `pi/agent/model-roles.json` →
`resolve-model.sh` (never hardcode in skills).
