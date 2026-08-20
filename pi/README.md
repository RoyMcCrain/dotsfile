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
~/.pi/agent/resolve-model.sh --field cursor impl.cursor   # -> Cursor Agent model id
~/.pi/agent/resolve-model.sh --label review.fugu
~/.pi/agent/resolve-model.sh --label review.grok
~/.pi/agent/resolve-model.sh --apply                      # sync derived config
~/.pi/agent/resolve-model.sh --check                      # verify nothing drifted
```

Current roles: `review.codex`, `review.claude`, `review.fugu`, `review.grok`,
`impl.cursor`, `research.xai`, `codex.default`.

To move to a new model version, edit `model-roles.json` only (the role's model ID
and the `enabledModels` list), then run `--apply`. Skills pick it up immediately
because `run_pi_review.sh --role ROLE` resolves through the same catalog.

`--apply` / `--check` cover the config files that cannot expand variables:

| Target                       | Key                    | Source role / field |
| ---------------------------- | ---------------------- | ------------------- |
| `pi/agent/settings.json`     | `enabledModels`        | `enabledModels`     |
| `codex/config.toml`          | `model`                | `codex.default.id`  |

`defaultProvider` / `defaultModel` in `settings.json` are intentionally *not*
managed, because Pi rewrites them at runtime when you switch with `/model`.
Run `--check` after editing the catalog to catch drift.

Tracked custom providers:

- `sakana-ai-console/fugu`
- `sakana-ai-console/fugu-ultra`
- `lm-studio/*` (dynamically loaded from `LM_STUDIO_BASE_URL` or
  `http://localhost:1234/v1`)

Built-in subscription providers (via `/login`):

- `anthropic/*` — Claude Pro/Max OAuth (built into Pi; no extra package)

`enabledModels` lists only models consumed by Pi itself. The Cursor implementation
role (`impl.cursor`) is resolved with `--field cursor` and consumed by the local
`cursor-agent` CLI, not Pi.

Environment variables:

```bash
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"  # Optional
export LM_STUDIO_API_KEY="..."           # Optional; dummy key is used if unset
```

### Sakana API key

`sakana-ai-console` is a custom provider, so keep its key in Pi's auth file. The
tracked example reads the key directly from macOS Keychain and contains no
secret:

```bash
cp pi/agent/auth.json.example ~/.pi/agent/auth.json
chmod 600 ~/.pi/agent/auth.json
```

The example expects a generic password item named `fugu-api-key`:

```bash
security find-generic-password -w -s fugu-api-key >/dev/null
```

If you do not want to use Keychain, edit `~/.pi/agent/auth.json` and store a
literal API key or an environment reference such as `$SAKANA_API_KEY`.

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

### Cursor Agent delegation (`cursor-agent`)

Implementation work delegates to the official/local `cursor-agent`
CLI directly — not through Pi or a Pi extension package.

```bash
cursor-agent status
cursor-agent login
cursor-agent --list-models
~/.pi/agent/resolve-model.sh --field cursor impl.cursor
```

- `impl.cursor` → `composer-2.5-fast` (implementation via `cursor-impl` skill)

Auth is independent from Pi. Use `cursor-agent status` / `cursor-agent login`.
Model IDs live in `model-roles.json`; resolve the implementation role with `--field cursor`.

**Chat persistence:** Each `cursor-agent` invocation writes local chat state under
`~/.cursor/chats/`, even when the process is fresh. Pi's former `--no-session`
isolation is not available in the current Cursor CLI help; do not assume
non-persistent delegation.

## Extensions

Configured by `settings.json` via `extensions/*.ts` and npm packages.

| Extension / package             | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `local-openai.ts`               | Auto-register LM Studio models from `LM_STUDIO_BASE_URL` at startup. |
| `clamp-openai-output-tokens.ts` | Clamp normal OpenAI payloads to the minimum `max_output_tokens = 16`. |
| `codex-usage.ts`                | Show ChatGPT Codex plan usage and reset time in Pi's footer. Refresh with `/codex-usage`. |
| `auto-fugu-model.ts`            | Route everyday work on `fugu`; auto-escalate to `fugu-ultra` at high-stakes points or in-run struggle. Toggle with `/auto-fugu on\|off\|status`. |
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

### Fugu model routing

`auto-fugu-model.ts` keeps `fugu` as the everyday model and promotes to
`fugu-ultra` only when preflight rules or in-run struggle signals warrant it. PR
creation stays on `fugu`. Explicit `fugu` / `fugu-ultra` requests override the
automatic rules. Any temporary fugu ↔ fugu-ultra switch restores the original
model at turn settlement; manual `/model` selection cancels auto-restore. Use
`/auto-fugu on|off|status` to toggle automatic routing; an
empty `/auto-fugu` toggles ON/OFF. After editing extensions or routing logic,
run `/reload` (core `node_modules` changes still require a Pi restart).

### Repo memory

`repo-memory-local.ts` stores durable, repo-specific notes **outside** the repo
(`~/.local/state/pi-repo-memory/<repo>-<hash>/memory.md`, `chmod 600`, never
versioned). A small index is injected at `session_start`.

- `recall_memory` — read saved notes (optional substring filter).
- `remember` — append one durable note (deduped; `[topic]` tag optional).
- `review_memory` — **agent-callable** consolidation tool. Saying e.g. 「メモリ整理して」
  triggers it: it rewrites `memory.md` in one LLM pass (using the current model)
  and keeps a `.bak` backup.

The same consolidation is also available as a user slash command (interactive,
asks to confirm before overwriting):

```text
/repo-memory-review
```

Both paths consolidate `memory.md` in **one LLM pass** (dedupe, prune
obsolete/one-off items, regroup under `## <topic>` headings, each bullet ≤ 220
chars, timestamps dropped) and keep a `.bak` backup. The `review_memory` tool
overwrites directly (no confirm) since `.bak` makes it recoverable; the slash
command asks to confirm and reports before/after note counts. The extension also
nudges (session_start index) to consolidate once memory grows past ~8KB.

## Skills

Do not duplicate shared skills under `pi/agent/skills/`. Pi discovers
`~/.agents/skills/` automatically.

### Single source of truth

Which skill directories are linked into `~/.agents/skills/` is defined by
`scripts/build_env/list_shared_agent_skills.sh`. Both `create_symlink.sh` and
`setup_fish.sh` call it — edit that script when adding or removing Pi skills.

After changing the list, re-run your dotfiles setup (or link manually) so
`~/.agents/skills/` picks up the new symlinks.

### Canonical layout

| Location | Role |
| -------- | ---- |
| `.agents/skills/` | **Pi-canonical** for cmux, review pipeline, jj-workspace, cheap-pr |
| `claude/skills/` | Claude Code full set; Pi-linked subset + firecrawl / research skills |
| `codex/skills/` | Codex-native overrides (`codex-review`, `mcp-delegate`) |

Shared skills that appear in both `.agents/skills/` and `claude/skills/` must
be **symlinks** in `claude/skills/` pointing at `.agents/skills/` (never two
copies of `SKILL.md`). Pi skill-collision warnings appear if both places hold
real directories with the same name. Shared `SKILL.md` files do not use
`metadata.target_agent`; exposure is controlled by which runtime directory links
the skill.

### Pi skill inventory (by category)

**Review** (plain 「レビューして」 → `parallel-review` L2 default):

| Skill | Trigger |
| ----- | ------- |
| `parallel-review` | 「レビューして」（単独） |
| `review-report` | 「レビューレポート作って」 |
| `implementation-report` | 「実装レポート作って」 |
| `review-verify` | 「裏取りして」 / verification パケット |
| `codex-review` / `claude-review` / `fugu-review` / `grok-review` | 単体 reviewer を明示指定時 |
| `hunk-review` | Hunk バンドル（devbox 同梱） |

**Implementation & PR**:

| Skill | Trigger |
| ----- | ------- |
| `cursor-impl` | 実装委譲（`/skill:cursor-impl`） |
| `cheap-pr` | 「PR 作って」等 |

**Workflow**:

| Skill | Trigger |
| ----- | ------- |
| `jj-workspace` | workspace 切り、Sentry 調査 |
| `mcp-delegate` | Slack/Sentry URL、OAuth MCP |

**Web research** (Claude `claude/skills/` から Pi にもリンク):

| Skill | Invoke | Notes |
| ----- | ------ | ----- |
| `firecrawl` | `/skill:firecrawl` | source dir: `claude/skills/firecrawl-cli` |
| `firecrawl-agent` | `/skill:firecrawl-agent` | structured extraction |
| `cross-research` | `/skill:cross-research` | Firecrawl + agy + Grok X Search 並列検証 |
| `antigravity-research` | `/skill:antigravity-research` | agy のみ（未検証サマリ） |

**cmux** (20 skills): `cmux`, `cmux-architecture`, … — see
`list_shared_agent_skills.sh` (`cmux*` glob).

Model IDs for review/impl roles: `pi/agent/model-roles.json` →
`resolve-model.sh` (never hardcode in skills).
