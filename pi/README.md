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
```

## Link this config

The dotfiles setup scripts link the tracked files into `~/.pi/agent` without
touching `auth.json`:

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
tracked example uses Bitwarden CLI and contains no secret:

```bash
cp pi/agent/auth.json.example ~/.pi/agent/auth.json
chmod 600 ~/.pi/agent/auth.json
```

Before starting Pi, unlock Bitwarden in the same shell so `bw get password` can
return the key:

```fish
set -gx BW_SESSION (bw unlock --raw)
bw sync
pi
```

If you do not want to use Bitwarden, edit `~/.pi/agent/auth.json` and store a
literal API key or an environment reference such as `$SAKANA_API_KEY`.

## Extensions

Configured by `settings.json` via `extensions/*.ts`.

| Extension         | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `local-openai.ts` | Auto-register LM Studio models from `LM_STUDIO_BASE_URL` at startup. |

Reload after editing extensions:

```text
/reload
```

## Skills

Do not duplicate shared skills here. Pi automatically discovers
`~/.agents/skills/`, so Firecrawl and other shared agent skills are loaded from
the existing agents skill directory.
