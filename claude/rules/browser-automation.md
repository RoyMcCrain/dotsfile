# Browser Automation Routing

- MUST prefer the `cmux-browser` skill for routine UI inspection, screenshots,
  navigation, form interaction, and data extraction when running inside cmux and
  WKWebView capabilities are sufficient.
- Use Playwright only when the task requires Playwright E2E tests,
  Chromium-specific or cross-browser behavior, viewport/device emulation,
  network mocking, tracing/video, or another CDP-only feature. If cmux is
  unavailable, Playwright may be used as the fallback.
- Every Playwright invocation (API, wrapper, or CLI) MUST use an isolated
  session/profile. MUST NOT attach to the user's normal Chrome through
  CDP/extension or reuse its profile unless the user explicitly requests it.
  When using `playwright-cli`, use a named isolated session and close it in the
  same task.
- This routing does not replace the web-research policy. Searching, scraping,
  crawling, and researching external web content must continue to use the
  designated Firecrawl-based workflow.
