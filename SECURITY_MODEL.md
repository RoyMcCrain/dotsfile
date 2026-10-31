# Threat model: RoyMcCrain personal Cloudflare stack + dotfiles

This threat model covers three repositories as one system, and the same file lives at the root of each. It was drafted from the code together with the owner's answers on attackers, critical assets and scope, and Devin security scans use it to prioritize findings. Keep the copies in sync when you edit it.

Scope: `RoyMcCrain/rss-reader`, `RoyMcCrain/cloudflare-os-deployment`, `RoyMcCrain/dotsfile`. There is no separate infrastructure repo. The infrastructure as code is the `wrangler*.jsonc` files, `deployment.jsonc` and `.github/workflows/*` inside these repos. Cloudflare Access applications/policies and DNS are configured in the Cloudflare dashboard and are **not** in code.

## 1. System overview and trust boundaries

All of this is personal, single-user infrastructure owned by one person (me@rrrr.dev), on one Cloudflare account (`8da37f2c…`). Access team domain: `blog-ao0-pages.cloudflareaccess.com`.

Trust boundaries:
1. **Internet → Cloudflare Access** in front of `redact-rss.rrrr.dev` and `os.rrrr.dev`. Access allows only me@rrrr.dev.
2. **Public Worker → private Workers** over service bindings (`workers_dev`/`preview_urls` disabled on private Workers).
3. **Workers → untrusted internet content**: RSS/Atom/OPML feeds, article images, websites, email and calendar data processed by AI agents.
4. **Cloudflare OS agents → Gatekeepers**: an agent acts on the vault and calendar only through Gatekeepers. Writes are approval-gated by default.
5. **CI (GitHub Actions) → Cloudflare account** via `CLOUDFLARE_API_TOKEN` in the `production` environment.
6. **Workstation AI agents (Claude Code, Codex, Pi, agy) → local machine**, configured by dotsfile.

## 2. Components

| Component | Code | Notes |
|---|---|---|
| **rss-web** | `rss-reader/apps/web` | TanStack Start/Redact SSR Worker on `redact-rss.rrrr.dev`. Forwards `Cf-Access-Jwt-Assertion` to the API over the `API` binding (`src/lib/server-transport.ts`). Image proxy route `routes/api.articles.$id.image.ts`. |
| **rss-api** | `rss-reader/apps/api` | Void/Hono Worker + D1 (`rss-reader-prod`). Auth in `src/auth.ts` (jose JWKS, aud/iss/exp/email) and `src/api/guards.ts` (public: `/api/health`, `/api/openapi.json`; Origin check on mutations). Feed fetching with SSRF guard `src/lib/url-validator.ts`. Parsers `rss-parser.ts`, `opml-parser.ts`, `xml.ts`, `feed-images.ts`, `image-bytes.ts`. 15-minute cron `src/crons/refresh.ts`. |
| **rss-interest** | `rss-reader/apps/interest-worker` | Private Worker with Workers AI (EmbeddingGemma / Jev), RPC-only from rss-api. |
| **cfos-router-workshop** | `cloudflare-os-deployment/cloudflare-os` (upstream submodule), `scripts/deploy.ts`, `scripts/deployment-config.ts`, `deployment.jsonc` | Router on `os.rrrr.dev` in Cloudflare Access mode. Admin allowlist `["me@rrrr.dev"]`. Workshop, Context, Scheduler and Google Gatekeepers behind service bindings. AI Gateway with the Workers AI binding. |
| **obsidian-gatekeeper** | `cloudflare-os-deployment/packages/custom-gatekeeper` (+ `container/`) | Obsidian Sync vault access (vault "tasks", `writeEnabled: true`, E2E password). Container authenticated by `INTERNAL_CONTAINER_TOKEN`. Path policy `shared/path-policy.ts`, patch/validation, R2 checkpoints, deletion quarantine. Secrets: `OBSIDIAN_AUTH_TOKEN`, `INTERNAL_CONTAINER_TOKEN`, `OBSIDIAN_VAULT_PASSWORD`. |
| **cfos-gadgets** | `cloudflare-os-deployment/gadgets/inbox-triage-scheduler` | Agent-run scheduled inbox triage that moves notes in the vault. |
| **ci-deploy** | `*/.github/workflows/*.yml`, `packages/error-reporter` | `deploy-production.yml`: only on main by the repo owner, pinned action SHAs, `persist-credentials: false`, `CLOUDFLARE_API_TOKEN`. The error reporter is RPC-only. |
| **workstation-dotfiles** | `dotsfile/claude`, `codex`, `pi`, `antigravity`, `scripts`, `ssh`, `fish`, `devbox`, `skills` | Claude Code `defaultMode: bypassPermissions`, sandbox disabled. Deny rules for `.env*` and `~/.config/gh`. PreToolUse hook `claude/hooks/block-dangerous-commands.sh` (blocks push to main and reads of secret env files). SSH keys in the Bitwarden agent (`ssh/config`). `scripts/wsl/sync_nas_credentials.sh` writes `/etc/samba/creds-nas`. `scripts/build_env/sync_pi_claude_auth.sh` copies Claude OAuth tokens into `~/.pi/agent/auth.json`. MCP servers (`claude/mcp-servers.json`, `npx -y @google/clasp`). |

## 3. Entry points and who can reach them

- `https://redact-rss.rrrr.dev/*` (rss-web): anyone on the internet up to Access; past Access, only me@rrrr.dev. rss-api is reachable only through the binding. `/api/health` and `/api/openapi.json` need no auth.
- `https://os.rrrr.dev/*` (router): `/api` → Workshop, `/gatekeeper/<name>` → Gatekeepers (e.g. OAuth callbacks), `/admin` (admins only).
- Cron triggers: the rss-api feed refresh (fetches attacker-controllable URLs) and the Cloudflare OS Scheduler (runs agents on schedules).
- Content the agents consume: feed bodies, images, Obsidian notes, Google Calendar events, email (email Gatekeeper), web pages. All of it is attacker-influenceable.
- GitHub: pushes/PRs to the three repos and Dependabot. The deploy runs only for the owner's pushes to main.
- Workstation: anything Claude Code/Codex/Pi reads (repos, web pages, PR comments, MCP tool output), plus shell startup files.

## 4. Assets and sensitivity

**Owner-confirmed most critical asset: local workstation secrets** (SSH keys in the Bitwarden agent, NAS SMB creds, Claude/Codex/Pi/agy auth tokens, gh credentials). The ranking below is otherwise a draft.


1. Cloudflare account control: `CLOUDFLARE_API_TOKEN` (CI) and wrangler login.
2. Obsidian vault contents plus `OBSIDIAN_AUTH_TOKEN` and the vault E2E password. The Gatekeeper is write-capable.
3. Google Calendar OAuth refresh tokens (UserAccount Durable Objects in `cloudflareos-gk-google`).
4. Workstation secrets: SSH keys (Bitwarden agent), NAS SMB creds, Claude/Codex/Pi OAuth tokens, gh credentials.
5. Cloudflare OS Context/KV/R2 data and AI Gateway spend.
6. RSS reader D1 data (subscriptions, read state, interest vectors): low sensitivity.

## 5. Attacker profiles

Owner-confirmed: **all of A1–A4 are in scope**.


- **A1 Anonymous internet**: tries to bypass Access (forged or missing JWT, unprotected hostnames, `workers.dev`/preview URLs, public API paths).
- **A2 Hostile content author**: controls a feed, an image, a web page, an email or a calendar invite. Goals: SSRF into internal/Cloudflare-internal services, XSS in the reader, parser DoS, or prompt injection that makes an agent misuse Gatekeepers (vault writes/deletes, data exfiltration).
- **A3 Supply chain**: a malicious npm/Deno/devbox dependency, an upstream `cloudflare-os` release, a GitHub Action, a skill or MCP package pulled with `npx -y`.
- **A4 Prompt injection on the workstation**: untrusted text read by Claude Code running with `bypassPermissions` and no sandbox.
- No multi-tenant or insider attacker: there is only one user.

## 6. Existing controls

- Access JWT verification in rss-api (`auth.ts`), with the JWT forwarded explicitly by rss-web. `workers_dev`/`preview_urls` are false on the rss Workers. The local bypass needs `LOCAL_DEV_AUTH_BYPASS=true` **and** a loopback request URL.
- SSRF guard (private/reserved IPv4/IPv6 ranges, metadata hostname, manual redirect re-validation) in `url-validator.ts`. Links are restricted to http(s) with no credentials (`html.ts` `sanitizeLink`). Feed HTML is reduced to plain text. Request bodies are capped at 2 MB.
- Cloudflare OS: Access mode, admin allowlist, approval-gated Gatekeeper writes, revision checks, R2 checkpoints, deletion quarantine.
- CI: least-privilege `contents: read`, pinned actions, owner-only deploy, environment-scoped secrets, Dependabot.
- Workstation: Claude deny rules, the PreToolUse hook, SSH keys kept off disk, `umask 077` for synced auth files.

## 7. Out of scope / accepted risk (owner-confirmed)

- **Upstream `cloudflare-os` submodule** (`cloudflare-os-deployment/cloudflare-os/**`): third-party code, not the owner's to fix. Findings located there are out of scope. Findings in the owner's own config or glue that *uses* upstream insecurely stay in scope.
- **Local dev auth bypass on 127.0.0.1** (`LOCAL_DEV_AUTH_BYPASS` in `rss-reader/apps/api/src/auth.ts`): accepted, as long as it stays loopback-only. A way to trigger it from a non-loopback request is still in scope.
- **Claude Code `bypassPermissions` + sandbox disabled** (`dotsfile/claude/settings.json`): a deliberate choice. Findings whose only point is that this mode is on are accepted risk. Prompt-injection or supply-chain paths that *reach workstation secrets* through other weaknesses (hooks, deny-rule gaps, scripts that leak creds) remain in scope, because workstation secrets are the critical asset.

Not ruled out: vendored skill docs under `dotsfile/skills/*` (in scope).

## 8. Open questions

- Name of the separate repo holding Cloudflare Access / DNS / account config. The owner says one exists, but it hasn't been named yet.
- Do Access policies cover every hostname that routes to these Workers?
