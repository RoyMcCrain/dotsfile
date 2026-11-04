---
name: cross-research
description: |
  Run important Web research through three parallel lanes: Grok Web Search for discovery and synthesis, targeted Firecrawl for official-source/body verification, and agy for auxiliary reasoning. Use for code/design/dependency decisions, independent multi-source verification, facts variable within the last 12 months, or anticipated contradictions. Routine search uses grok-search.
allowed-tools:
  - Bash(agy *)
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
  - Bash(~/.agents/skills/cross-research/scripts/grok-x-search.sh *)
  - Bash(jq *)
---

# Cross-research

Use for substantial research requiring verification. Grok Web Search leads discovery and synthesis; targeted Firecrawl verifies official sources/bodies; agy provides auxiliary reasoning. Parallelize independent work, but do not count model agreement or the same underlying source URL as independent evidence. Authority comes from the actual source and body, not the retrieval provider. Cite Grok synthesis; X rumors are not Web evidence.

1. Reuse `.firecrawl/` cache only when query or source URL, version, provenance, and freshness are adequate; retain actual source/fetch dates. Never relabel a cached artifact with a new fetch date.
2. Start independent work in parallel. Allocate a fresh directory for EVERY invocation, including each Grok query, each Firecrawl URL scrape, and each targeted Firecrawl search. Never share one output path across sources or parallel tasks. In each directory retain a manifest associating the exact query or actual source URL, actual UTC fetch time, and response/body filename; Grok results must also retain citation URLs. Only successful retrievals get a manifest; do not reuse failed requests without one as verified cache. For example, use these independent allocation patterns (fill in the query or URL for each invocation):
   - Grok Web Search discovery/synthesis:
     ```bash
     query="[query]"
     mkdir -p .firecrawl &&
     	result_dir=$(mktemp -d .firecrawl/cross-grok.XXXXXX) &&
     	~/.agents/skills/cross-research/scripts/grok-x-search.sh --mode web --query "$query" --output "$result_dir/response.json" &&
     	jq -n --arg query "$query" --arg fetched_at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg response "response.json" '{query: $query, fetched_at_utc: $fetched_at, response: $response}' >"$result_dir/manifest.json"
     ```
   - agy auxiliary reasoning (not authority or a source by itself):
     `agy --print-timeout 600s -p "[research question]"`
   - Firecrawl targeted verification for each known official URL (run this allocation separately for every URL):
     ```bash
     source_url="[official-url]"
     mkdir -p .firecrawl &&
     	result_dir=$(mktemp -d .firecrawl/cross-scrape.XXXXXX) &&
     	firecrawl scrape "$source_url" -o "$result_dir/body.md" &&
     	jq -n --arg source_url "$source_url" --arg fetched_at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg body "body.md" '{source_url: $source_url, fetched_at_utc: $fetched_at, body: $body}' >"$result_dir/manifest.json"
     ```
     If no official URL is known, search narrowly on the official site (allocate a new directory separately for every search):
     ```bash
     query="site:[official-domain] [narrow query]"
     mkdir -p .firecrawl &&
     	result_dir=$(mktemp -d .firecrawl/cross-search.XXXXXX) &&
     	firecrawl search "$query" --scrape --limit 3 -o "$result_dir/response.json" --json &&
     	jq -n --arg query "$query" --arg fetched_at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg response "response.json" '{query: $query, fetched_at_utc: $fetched_at, response: $response}' >"$result_dir/manifest.json"
     ```
     Use map/crawl/agent only when needed for discovery, multi-page retrieval, or structured extraction. Known official URLs and independent targeted searches may run in parallel. Fetching pages discovered by Grok is dependent work; do it afterward. Do not repeat generic searches just to duplicate Grok.
3. Inspect actual official source bodies and cite URLs. Separate body evidence from model agreement, distinguish confirmed facts from inference, describe contradictions, and do not claim certainty without verification.
4. Record lane failures and omissions. On Firecrawl failure, credits, rate limits, auth, or API issues, check `firecrawl --status`, then reuse adequate cache if available; otherwise continue with Grok + agy and clearly state that official source bodies remain unverified. Grok failure may fall back to Firecrawl discovery, clearly disclosed. agy failure means auxiliary reasoning is absent. If all lanes fail, stop and report.

For agy, use a caller Bash/tool timeout of at least 660 seconds (agy itself uses 600 seconds). For Claude Code, set the parent Bash timeout before launch: `BASH_MAX_TIMEOUT_MS=660000 claude`; set the tool timeout to 660000ms. Do not export this inside Bash; start a new session/restart if the setting was unset at launch. Keep substantial deliverables in the repository's existing research-docs directory, or `docs/research/` if none exists; raw fetched data stays in `.firecrawl/`.

The Grok script resolves the `research.xai` role and uses existing `XAI_API_KEY`, then the pi XAI bearer-token fallback; do not specify model IDs or expose tokens. Use `--mode x` only for explicitly X-only requests, separate from general Web research. Firecrawl and Grok may incur usage-based costs; avoid unnecessary duplicate retrieval.
