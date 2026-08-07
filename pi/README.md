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

## Model setup

Use Pi's built-in subscription flow when possible:

```text
/login
/model
```

The default model is `cursor/grok-4.5` with thinking level `high`
(set in `settings.json`).

Tracked custom providers:

- `sakana-ai-console/fugu`
- `sakana-ai-console/fugu-ultra`
- `lm-studio/*` (dynamically loaded from `LM_STUDIO_BASE_URL` or
  `http://localhost:1234/v1`)
- `cursor/*` via `@rahularya01/pi-cursor` (subscription / OAuth; unofficial)

Environment variables:

```bash
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"  # Optional
export LM_STUDIO_API_KEY="..."           # Optional; dummy key is used if unset
# Optional. Prefer the package default (or cli-2026.07.23-e383d2b).
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

### Cursor models (`@rahularya01/pi-cursor`)

Unofficial community package (most-downloaded OAuth Cursor provider on
pi.dev). Uses Cursor subscription auth — not the official `@cursor/sdk` API-key
path. Recorded in `settings.json` as `packages: ["npm:@rahularya01/pi-cursor"]`
and installed under `~/.pi/agent/npm/` (not tracked).

```bash
pi install npm:@rahularya01/pi-cursor   # already in settings.json; re-run on a new machine
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
Cursor changes it. Verified working against npm `1.4.8` with the package default
client version (and with `PI_CURSOR_CLIENT_VERSION=cli-2026.07.23-e383d2b`).
Setting `PI_CURSOR_CLIENT_VERSION` to the current `agent --version`
(`2026.08.04-…`) currently triggers `resource_exhausted`. Open PR
https://github.com/Rahularya01/pi-cursor/pull/4 improves GOAWAY / heartbeat
handling but is not required for basic prompts.

## Extensions

Configured by `settings.json` via `extensions/*.ts` and npm packages.

| Extension / package             | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `local-openai.ts`               | Auto-register LM Studio models from `LM_STUDIO_BASE_URL` at startup. |
| `clamp-openai-output-tokens.ts` | Clamp normal OpenAI payloads to the minimum `max_output_tokens = 16`. |
| `auto-fugu-model.ts`            | Route everyday work on `fugu`; auto-escalate to `fugu-ultra` at high-stakes points or in-run struggle. Toggle with `/auto-fugu on\|off\|status`. |
| `save-compaction-log.ts`        | Save compaction summaries to `~/.pi/agent/compaction-logs/`.         |
| `npm:@rahularya01/pi-cursor`    | Cursor subscription models via OAuth / CLI Keychain (unofficial). |

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
- `.agents/skills/review-report`
- `.agents/skills/parallel-review`
- `claude/skills/claude-review`
- `claude/skills/cursor-impl`
- `codex/skills/codex-review`

The setup scripts link matching `~/.agents/skills/*` paths back to those tracked
directories. Keeping separate real copies in both places causes Pi skill-collision
warnings.
