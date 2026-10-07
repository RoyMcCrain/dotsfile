# Jev routing context (schemaVersion 1)

Bounded factual hints for **auto** level selection only. Reviewers receive the
patch alone; this JSON is sent to Jev inside `state.context` after CLI /
`buildJevRequestBody` validation (fixed six keys, size caps, no extra fields).
Evidence strings are routing hints only—they are **not** opened automatically.
Do not write recommended levels, risk scores, or confidence targets.

| Key                    | Collect when known                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **intent**             | What the change is meant to do before vs after (bugfix, refactor, feature), from the user request and the diff—not guessed from filenames alone. |
| **runtime**            | Where code actually runs or deploys (local CLI, worker, mobile build, etc.) from inspected config and entrypoints.                               |
| **impact**             | Callers, shared contracts, and blast radius you verified in source (imports, public APIs, config consumed elsewhere).                            |
| **dataAndPermissions** | Persisted data, auth, permissions, money, or external-send boundaries touched or unchanged—only with patch/source evidence.                      |
| **rollback**           | Reversible code/config vs irreversible side effects (migrations, deletions, one-way API calls) you can point to in the change.                   |
| **tests**              | Commands actually run **and** their observed outcome. A test file in the diff is not a passing test.                                             |

**Unknown is valid.** Leave a field `unknown` when you lack evidence. Do not
invent “no external send” or “safe rollback” without inspectable support.
`unknown` means unconfirmed, not “no risk.”

**High-impact risk is not downgraded by tests alone.** Green unit tests do not
make permission, credential, or payment correctness changes shallow review.

Evidence strings should be safe to cite (public paths, synthetic examples). Do
not paste private review history, tokens, or customer data.

Example (illustrative, not ground truth):

```json
{
  "schemaVersion": 1,
  "intent": {
    "summary": "Lower default Jev min-confidence threshold; rubric examples only",
    "evidence": ["skills/parallel-review/scripts/select_review_level.ts"]
  },
  "runtime": {
    "summary": "Deno CLI invoked locally during parallel-review preflight",
    "evidence": ["skills/parallel-review/SKILL.md"]
  },
  "impact": "unknown",
  "dataAndPermissions": "unknown",
  "rollback": {
    "summary": "Revert edited TS/MD files in parallel-review skill",
    "evidence": ["skills/parallel-review/"]
  },
  "tests": "unknown"
}
```

A known **tests** fact requires both an executed command and the observed result
(pass/fail/skip counts)—not merely naming a test file or command.
