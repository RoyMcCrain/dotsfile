# Deno review runner process-control research

Date: 2026-08-07

## Findings

- Local runtime is Deno 2.9.3 on macOS arm64.
- Current `Deno.CommandOptions` includes `signal?: AbortSignal` and `detached?: boolean`.
- The local type documentation says `signal` sends `SIGTERM` to the process. It does not document descendant cleanup.
- A local experiment with `detached: true` showed the spawned child PID equals its PGID. `Deno.kill(-child.pid, "SIGTERM")` then terminated the group successfully.
- Therefore the Python runner's `start_new_session=True` + `os.killpg` behavior can be reproduced in current Deno with `detached: true` + negative-PID `Deno.kill` on macOS.
- Manual process-group termination is still preferable to relying only on `AbortSignal`, because Pi/provider subprocesses may have descendants.
- Deno adds repository consistency (`deno fmt`, `deno lint`, `Deno.test`) and optional permission boundaries, but permission flags and cross-platform process behavior add operational complexity.

## Cross-check note

Antigravity claimed `Deno.CommandOptions` lacked a detach/session option. That is stale for the locally installed Deno 2.9.3; local type definitions and runtime behavior take precedence. Firecrawl retrieved the official subprocess API, which lists `Deno.Command`, `Deno.ChildProcess`, and `Deno.kill` but its extracted overview did not expose all `CommandOptions` fields.

## Bash/Bats decision

- macOS Bash 3.2 was locally verified to assign PGID=PID to a background job when monitor mode is enabled only around spawn (`set -m`; spawn; `set +m`). Negative-PGID `kill` terminated the process group.
- The runner can therefore remain shell-only without Python or Deno at runtime.
- `bats-core` supports Bash 3.2 and provides TAP output and isolated tests. The repository already had `jq`, `shellcheck`, and `shfmt`; only `bats@latest` was added to devbox.
- The migrated runner passed 19 Bats cases covering command isolation, repeated inputs, Cursor extension loading, exit propagation, prompt watchdog cancellation, integer/decimal timeout, invalid timeout, paths with spaces, TERM/HUP/INT process-group cleanup, symlink resolution, and secret rejection.
- Runtime speed is unaffected materially; this change reduces language/tooling fragmentation rather than model latency.

## Sources

- https://docs.deno.com/api/deno/subprocess/
- https://docs.deno.com/api/deno/~/Deno.Command
- https://docs.deno.com/api/deno/~/Deno.ChildProcess
- https://docs.deno.com/api/deno/~/Deno.kill
- https://docs.deno.com/api/deno/~/Deno.addSignalListener
- https://docs.deno.com/runtime/fundamentals/security/
