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
~/.pi/agent/resolve-model.sh --list             # role -> model id -> label
~/.pi/agent/resolve-model.sh review.cursor      # -> current model id
~/.pi/agent/resolve-model.sh --label review.fugu
~/.pi/agent/resolve-model.sh --apply            # sync derived config
~/.pi/agent/resolve-model.sh --check            # verify nothing drifted
```

Current roles: `review.cursor`, `review.codex`, `review.claude`, `review.fugu`,
`impl.cursor`, `codex.default`.

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
- `cursor/*` via `@rahularya01/pi-cursor` (subscription / OAuth; unofficial)

Built-in subscription providers (via `/login`):

- `anthropic/*` — Claude Pro/Max OAuth (built into Pi; no extra package)

Environment variables:

```bash
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"  # Optional
export LM_STUDIO_API_KEY="..."           # Optional; dummy key is used if unset
# Optional. The GOAWAY fix branch defaults to cli-2026.07.23-e383d2b.
# Do NOT set this to the latest `agent --version` string — that can cause
# resource_exhausted / wire-drift failures.
# export PI_CURSOR_CLIENT_VERSION="cli-2026.07.23-e383d2b"
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

### Cursor models (`@rahularya01/pi-cursor`)

Unofficial community package (most-downloaded OAuth Cursor provider on
pi.dev). Uses Cursor subscription auth — not the official `@cursor/sdk` API-key
path. Recorded in `settings.json` as the GOAWAY-fix git branch (PR #4) until
upstream npm publishes it:
`git:github.com/kouvaliasnick/pi-cursor@fix/goaway-after-turn-ended`.

```bash
# pi's git installer skips devDeps, so build dist via the setup script:
./scripts/build_env/setup_pi_cursor_goaway_fix.sh
pi --list-models cursor
pi --model cursor/composer-2
```

Auth (pick one):

1. Preferred: already logged in via `agent login` / Cursor Desktop, then sync
   Keychain tokens into Pi's auth store:

   ```bash
   ./scripts/build_env/sync_pi_cursor_auth.sh
   ```

2. Or inside pi: `/login cursor` (browser PKCE OAuth)

Useful commands: `/cursor.doctor`, `/cursor.usage`, `/cursor.models`.
Details: https://pi.dev/packages/@rahularya01/pi-cursor

Note: this reverse-engineers Cursor's agent wire protocol and can break when
Cursor changes it. Upstream npm `1.4.8` still treats post-`turnEnded`
`GOAWAY (errorCode=0)` as a hard error and appends wire-drift noise.
We pin the open PR that completes those turns silently:
https://github.com/Rahularya01/pi-cursor/pull/4
(default client `cli-2026.07.23-e383d2b`). Do not set
`PI_CURSOR_CLIENT_VERSION` to the current `agent --version` (`2026.08.04-…`);
that currently triggers `resource_exhausted`. After upstream merges/publishes,
switch `settings.json` back to `npm:@rahularya01/pi-cursor`.

## Extensions

Configured by `settings.json` via `extensions/*.ts` and npm packages.

| Extension / package             | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `local-openai.ts`               | Auto-register LM Studio models from `LM_STUDIO_BASE_URL` at startup. |
| `clamp-openai-output-tokens.ts` | Clamp normal OpenAI payloads to the minimum `max_output_tokens = 16`. |
| `auto-fugu-model.ts`            | Route everyday work on `fugu`; auto-escalate to `fugu-ultra` at high-stakes points or in-run struggle. Toggle with `/auto-fugu on\|off\|status`. |
| `save-compaction-log.ts`        | Save compaction summaries to `~/.pi/agent/compaction-logs/`.         |
| `git:…/pi-cursor@fix/goaway-after-turn-ended` | Cursor models via OAuth; silences post-turn GOAWAY (PR #4). |

Reload after editing extensions:

```text
/reload
```

### Fugu model routing

`auto-fugu-model.ts` keeps `fugu` as the everyday model and promotes to
`fugu-ultra` only when preflight rules or in-run struggle signals warrant it. PR
creation stays on `fugu`. Explicit `fugu` / `fugu-ultra` requests override the
automatic rules. Any temporary fugu ↔ fugu-ultra switch restores the original
model at turn settlement; manual `/model` selection cancels auto-restore. Use
`/auto-fugu on|off|status` to toggle automatic routing; an
empty `/auto-fugu` toggles ON/OFF. After editing extensions or routing logic,
run `/reload` (core `node_modules` changes still require a Pi restart).

## Skills

Do not duplicate shared skills under `pi/agent/skills/`. Pi automatically
discovers `~/.agents/skills/`, so Firecrawl and other shared agent skills are
loaded from the existing agents skill directory.

Some routing-critical skills are tracked in this repository for reproducibility:

- `.agents/skills/cmux*`
- `.agents/skills/cheap-pr`
- `.agents/skills/cursor-review`
- `.agents/skills/fugu-review`
- `.agents/skills/implementation-report`
- `.agents/skills/review-report`
- `.agents/skills/parallel-review`
- `claude/skills/claude-review`
- `claude/skills/cursor-impl`
- `codex/skills/codex-review`

The setup scripts link matching `~/.agents/skills/*` paths back to those tracked
directories. Keeping separate real copies in both places causes Pi skill-collision
warnings.
