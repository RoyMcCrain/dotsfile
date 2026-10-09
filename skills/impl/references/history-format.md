# Implementation run history format

`schemaVersion: 1` — stable contract for offline comparison reports.

## Layout

- History root (default `${XDG_DATA_HOME:-~/.local/share}/impl/runs`, override with `IMPL_RUNS_DIR` or `run_impl.sh --runs-dir`). Relative `IMPL_RUNS_DIR` and relative `--runs-dir` resolve against the shell invocation working directory **before** `cd --cwd`.
- Each execution: unique subdirectory (mode `0700`), never reused. Existing history roots are never `chmod`’d by the runner; only newly created roots receive `0700`.
- `metadata.json` (mode `0600`) — aggregate run record.
- `events.jsonl` (mode `0600`) — whitelisted metadata-only Pi stream events. Created empty before Pi starts.

Raw prompts, system prompts, assistant text, tool args/results, stderr, env, and oversize/malformed stream payloads are **not** stored.

## metadata.json (required fields)

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | |
| `runId` | string | Unique within history root |
| `role` | string | Catalog role (e.g. `impl.default`) |
| `resolvedModel` | string | Provider/model including effort |
| `startedAt` / `finishedAt` | ISO-8601 UTC | `finishedAt` absent while `executionStatus` is `running` |
| `elapsedMs` | number? | Monotonic duration (ms), ≥ 0; **absent while running** |
| `exitCode` | integer? | Child process exit; **absent while running** |
| `executionStatus` | enum | `running`, `completed`, `failed`, `incomplete` |
| `stopReason` | enum? | Allowlisted Pi stop reason or `unknown` when persisted |
| `promptSha256` / `systemPromptSha256` | hex (64) | SHA-256 of file bytes only |
| `codeProvenance` | object | `repositoryPath`, `startRevision` (40–64 hex when known), `revisionKind` (`jj`/`git`/`unknown`), `comparable` (bool) |
| `usage` | object | See below |
| `assistantResponseCount` | number | |
| `toolCalls` / `toolErrors` | object | Counts for `read`, `bash`, `edit`, `write`, `unknown` |
| `retryCount` / `compactionCount` | number | `retryCount` counts `auto_retry_start` events |
| `parentValidationStatus` | enum | `unverified` (default), `passed`, `failed`, `not-run` |

### Usage object (`usage`)

Numeric fields (`input`, `output`, `cacheRead`, `cacheWrite`, `cacheWrite1h`, `reasoning`, `totalTokens`, `estimatedCostUsd`) are **sums of observed contributions only**. Missing numeric keys mean no observations, not zero.

| Field | Meaning |
| --- | --- |
| `expectedSlices` | Count of usage-bearing slices: each assistant `message_end` plus each `compaction_end` with a result (usage optional per slice) |
| `knownSlices` | Per-metric count of slices that reported that metric (`UsageMetric` keys) |
| `coverage` | `unknown` when `expectedSlices === 0` or no slice reported any core metric (`input`, `output`, `cacheRead`, `cacheWrite`); `complete` only when every slice reported all four core metrics; otherwise `partial`. Sums omit metrics that overflow finite addition. |
| `sources` | Allowlisted origins only: `assistant_message_end`, `compaction_end` |

Cost completeness is independent: compare `knownSlices.estimatedCostUsd` to `expectedSlices` (when `expectedSlices > 0`). Do **not** fold `reasoning` into `output`, `cacheWrite1h` into `cacheWrite`, or token totals into `totalTokens` unless explicitly present on the slice. Only assistant `message_end` and `compaction_end` usage contribute — never `message_update`, `agent_end`, or `turn_end` snapshots.

### Completion vs correctness

`executionStatus: completed` means the final assistant `message_end` has allowlisted `stopReason: stop`, the final `agent_settled` included explicit `aborted: false`, the JSONL stream was valid (well-formed object records ≤ 1 MiB per line, valid UTF-8, no trailing partial frames), and the child exited `0`. Empty final assistant text is allowed. Malformed JSON, scalar/array lines, oversize records, invalid UTF-8, or `agent_settled` without explicit `aborted` prevent completion even when the child exits `0`; the runner returns non-zero while `exitCode` still records the child result. Non-zero child exit always yields `executionStatus: failed` with the preserved exit code. Runs with `executionStatus` of `failed` or `incomplete` are **not** full-run cost or usage estimates — observed totals are lower bounds at best. This does **not** imply tests passed; callers set `parentValidationStatus` after independent validation.

## events.jsonl

One JSON object per line. Allowed shapes: sanitized Pi events (`kind: pi_event`, `eventType`, `elapsedMs`, allowlisted enums, numeric usage/cost, tool duration/error flags) and minimal wrapper markers. No raw lines, secrets, tool args/results, or free-text diagnostics.

## Grouping for reports

Matched cases share `promptSha256`, `systemPromptSha256`, and comparable `codeProvenance` (same start revision when verified). Heterogeneous runs appear in overall summaries only.

## Commands

```bash
# Run (logging is automatic)
bash skills/impl/scripts/run_impl.sh --prompt PATH [--cwd PATH] [--role ROLE] [--runs-dir PATH]

# Offline report (read-only history root)
deno run --no-config \
  --allow-read="$RUNS_DIR,$REPO/skills/impl/scripts" \
  skills/impl/scripts/impl_history.ts report --runs-dir "$RUNS_DIR" --out report.json

# Record caller validation (read/write run metadata)
deno run --no-config \
  --allow-read="$RUNS_DIR,$REPO/skills/impl/scripts" \
  --allow-write="$RUNS_DIR" \
  skills/impl/scripts/impl_history.ts set-validation --run "$RUN_DIR" --status passed
```

Catalog cost figures in reports are **estimated USD**, not subscription billing.
