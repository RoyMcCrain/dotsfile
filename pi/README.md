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
export SAKANA_API_KEY="..."              # Sakana provider in models.json
export LM_STUDIO_BASE_URL="http://localhost:1234/v1"  # Optional
export LM_STUDIO_API_KEY="..."           # Optional; dummy key is used if unset
```

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
