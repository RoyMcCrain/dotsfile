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

The default model is `sakana-ai-console/fugu-ultra` (set in `settings.json`).

Tracked custom providers:

- `sakana-ai-console/fugu`
- `sakana-ai-console/fugu-ultra`
- `lm-studio/*` (dynamically loaded from `LM_STUDIO_BASE_URL` or
  `http://localhost:1234/v1`)

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

## Extensions

Configured by `settings.json` via `extensions/*.ts`.

| Extension                       | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `local-openai.ts`               | Auto-register LM Studio models from `LM_STUDIO_BASE_URL` at startup. |
| `clamp-openai-output-tokens.ts` | Clamp normal OpenAI payloads to the minimum `max_output_tokens = 16`. |
| `cheap-pr-model.ts`             | Switch PR creation requests to `sakana-ai-console/fugu`.             |
| `save-compaction-log.ts`        | Save compaction summaries to `~/.pi/agent/compaction-logs/`.         |

Reload after editing extensions:

```text
/reload
```

## Skills

Do not duplicate shared skills under `pi/agent/skills/`. Pi automatically
discovers `~/.agents/skills/`, so Firecrawl and other shared agent skills are
loaded from the existing agents skill directory.

Some routing-critical skills are tracked in this repository for reproducibility:

- `.agents/skills/cmux*`
- `.agents/skills/cheap-pr`
- `.agents/skills/cursor-review`
- `.agents/skills/fugu-review`
- `.agents/skills/parallel-review`
- `claude/skills/claude-review`
- `codex/skills/codex-review`

The setup scripts link matching `~/.agents/skills/*` paths back to those tracked
directories. Keeping separate real copies in both places causes Pi skill-collision
warnings.
