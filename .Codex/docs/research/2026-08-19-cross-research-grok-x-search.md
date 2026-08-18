# Cross-research: Grok X Search integration

Date: 2026-08-19

## Verified facts

- xAI officially supports the server-side `x_search` tool through `POST https://api.x.ai/v1/responses` with `grok-4.6`.
- The request uses `tools: [{ "type": "x_search" }]`.
- Official optional filters include `allowed_x_handles`, `excluded_x_handles`, `from_date`, `to_date`, `enable_image_understanding`, and `enable_video_understanding`.
- Official documentation allows up to 20 handles. The agy summary said 10; the first-party documentation takes precedence.
- Pi's xAI OAuth flow requests `api:access`, and `pi auth print-bearer-token --provider xai` exposes a refreshed bearer token without reading `auth.json` directly.
- A live OAuth smoke request completed with HTTP 200 and reported one `x_search_calls` invocation.
- The observed Responses API result put answer text in `output[].content[]` entries of type `output_text` and citations in `annotations[]` entries of type `url_citation`. A top-level `citations` field was absent, so integrations must parse annotations rather than rely on top-level citations.
- X Search costs server-side tool usage in addition to model tokens. Current official pricing lists $5 per 1,000 X Search calls.

## Integration decision

Add Grok X Search as a third parallel lane in `cross-research`:

1. Firecrawl: web search and fetched first-party pages.
2. agy: broad synthesis and trend reasoning, not independently authoritative.
3. Grok `x_search`: first-party X announcements and current public discussion.

Firecrawl remains the preferred source for canonical web documentation. First-party X posts can support announcement claims, while general X reactions are treated as social signals rather than proof.

## Authentication

Prefer `XAI_API_KEY` when explicitly configured. Otherwise resolve the existing Pi OAuth bearer token with:

```bash
pi auth print-bearer-token --provider xai
```

Never print or persist the token. Pass it to curl without placing it in command arguments when practical.

## Sources

- https://docs.x.ai/developers/tools/x-search
- https://docs.x.ai/developers/tools/web-search
- https://docs.x.ai/developers/quickstart
- Local Pi OAuth implementation: `pi-ai/dist/auth/oauth/xai.js`

## Cached evidence

- `.firecrawl/xai-x-search-search.json`
- `.firecrawl/xai-x-search-agy.txt`
- `.firecrawl/xai-x-search-smoke.json`
