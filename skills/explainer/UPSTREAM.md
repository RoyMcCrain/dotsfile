# Upstream and local patches

Vendored from [mizchi/explainer](https://github.com/mizchi/explainer), snapshot
**ccdd7bacfb47451e38506d837af8a629504960b2** (plugin 0.5.3). Only `explainer`,
`explainer-book`, and `first-reader` were included, with their sibling
structure, scripts, references, and upstream licenses/notices preserved.

Local changes: intent-based skill metadata and natural-language usage
descriptions; safe document-generation policy in explainer/book; first-reader
simulation/isolation disclosures; dedicated runtime and `run.sh`; runtime
dependency resolution patches in explainer's `verify-doc.mjs`, `build-html.mjs`,
and `figure-check.mjs`; failed check commands now fail verification; Japanese
EventEmitter example; workspace Claude links and scoped ignore rules. Local
documentation also specifies runtime setup and wrapper commands, optional tools,
exit-status-plus-output check semantics, simulation/privacy limits, and the cmux
browser delivery workflow for generated explanation HTML, including
workspace-scoped preview, verification reporting, and a no-cmux fallback. A
local `/explain` command and shared prompt template were added at
`skills/explainer/prompts/explain.md`, discovered by Pi settings and linked for
Claude at `claude/commands/explain.md`.

To update: review upstream changes at the URL above, vendor only these three
directories and license files, preserve local policies/runtime/demo, regenerate
the minimal runtime lock from exact dependency versions, rerun focused tests and
complexity comparison, and update this record. Never overwrite local patches
without reviewing the diff.
