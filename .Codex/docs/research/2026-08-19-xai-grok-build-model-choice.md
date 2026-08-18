# xAI coding model choice: grok-build-0.1 vs grok-4.6

Date: 2026-08-19

## Conclusion

Use `grok-4.6` as the default when coding quality matters. Use `grok-build-0.1` when minimizing agent-loop cost is more important than maximum capability.

## Verified facts

- xAI's model overview explicitly says: "For everything else, including code, use Grok 4.6."
- The Grok Build coding agent documentation says Grok Build is powered by `grok-4.6`.
- `grok-build-0.1` is still described as an intelligent coding model for agentic software engineering and workflow tasks.
- Short-context API pricing per 1M tokens:
  - `grok-4.6`: input $2.00, cached $0.50, output $6.00; 500k context.
  - `grok-build-0.1`: input $1.00, cached $0.20, output $2.00; 256k context.
- In the currently installed Pi catalog, both models support reasoning, but Pi does not expose a controllable reasoning-effort mapping for either model.

## Reconciliation

The broad-search summary initially favored `grok-build-0.1` for agentic coding. Current first-party documentation supersedes that recommendation: xAI now positions `grok-4.6` as its default code model and uses it in the Grok Build agent itself. `grok-build-0.1` remains useful as a cheaper coding-specialized option.

## Sources

- https://docs.x.ai/developers/models
- https://docs.x.ai/build/overview
- https://docs.x.ai/developers/models/grok-build-0.1
- https://docs.x.ai/developers/pricing

## Cached research

- `.firecrawl/grok-build-0.1-search.json`
- `.firecrawl/grok-build-0.1-model.json`
- `.firecrawl/grok-build-0.1-agy.txt`
