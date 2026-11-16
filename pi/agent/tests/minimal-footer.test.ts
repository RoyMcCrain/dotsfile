import { test } from "bun:test";
import {
  deepEqual as assertEquals,
  ok as assertTrue,
} from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import minimalFooter from "../extensions/minimal-footer.ts";

type Usage = {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
};

type Model = {
  id: string;
  provider: string;
  contextWindow: number;
  reasoning: boolean;
};

type State = {
  mode: string;
  cwd: string;
  sessionName: string | undefined;
  branch: string | undefined;
  model: Model | undefined;
  usage: Usage | undefined;
  thinking: string;
  autoCompact: boolean;
  providerCount: number;
  statuses: Map<string, string>;
};

type Footer = {
  render: (width: number) => string[];
  dispose?: () => void;
};

type FooterFactory = (
  tui: { requestRender: () => void },
  theme: { fg: (style: string, text: string) => string },
  footerData: unknown,
) => Footer;

const plainTheme = { fg: (_style: string, text: string) => text };
const ansiTheme = {
  fg: (style: string, text: string) => `\x1b[31m${style}:${text}\x1b[39m`,
};

const createHarness = (mode = "tui", settingsAvailable = true) => {
  const state: State = {
    mode,
    cwd: "/Users/tester/work/app",
    sessionName: "demo",
    branch: "main",
    model: {
      id: "gpt-test",
      provider: "openai",
      contextWindow: 200_000,
      reasoning: true,
    },
    usage: { tokens: 25_000, contextWindow: 200_000, percent: 12.5 },
    thinking: "high",
    autoCompact: true,
    providerCount: 1,
    statuses: new Map([
      ["b-status", "beta"],
      ["a-status", "alpha\n  two"],
    ]),
  };
  const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
  let factory: FooterFactory | undefined;
  let branchListener: (() => void) | undefined;
  let renderRequests = 0;

  const pi = {
    on(type: string, handler: (event: unknown, ctx: unknown) => void) {
      handlers.set(type, handler);
    },
    getThinkingLevel: () => state.thinking,
    getSettings: settingsAvailable
      ? () => ({ compaction: { enabled: state.autoCompact } })
      : undefined,
  };
  const ctx = {
    get mode() {
      return state.mode;
    },
    get model() {
      return state.model;
    },
    sessionManager: {
      getCwd: () => state.cwd,
      getSessionName: () => state.sessionName,
    },
    getContextUsage: () => state.usage,
    ui: {
      setFooter: (next: FooterFactory | undefined) => {
        factory = next;
      },
    },
  };
  const footerData = {
    getGitBranch: () => state.branch,
    getExtensionStatuses: () => state.statuses,
    getAvailableProviderCount: () => state.providerCount,
    onBranchChange: (listener: () => void) => {
      branchListener = listener;
      return () => {
        branchListener = undefined;
      };
    },
  };

  minimalFooter(pi as never);
  const startSession = () => handlers.get("session_start")?.({}, ctx);
  const shutdownSession = () => handlers.get("session_shutdown")?.({}, ctx);
  const mount = (theme = plainTheme) => {
    assertTrue(factory, "a custom footer should be installed");
    return factory(
      {
        requestRender: () => {
          renderRequests += 1;
        },
      },
      theme,
      footerData,
    );
  };

  return {
    state,
    startSession,
    shutdownSession,
    mount,
    getFactory: () => factory,
    triggerBranchChange: () => branchListener?.(),
    get renderRequests() {
      return renderRequests;
    },
  };
};

const withHome = <T>(home: string, run: () => T) => {
  const previous = process.env.HOME;
  process.env.HOME = home;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
  }
};

test("hides the token, cache, and cost chunk while keeping path, context, model, and statuses", () => {
  // Arrange
  const harness = createHarness();
  harness.state.cwd = "/Users/tester/work/app";
  harness.state.sessionName = "RESEARCH";

  // Act
  const lines = withHome("/Users/tester", () => {
    harness.startSession();
    return harness.mount().render(80);
  });

  // Assert
  assertEquals(lines[0], "~/work/app (main) • RESEARCH");
  assertTrue(lines[1].startsWith("12.5%/200k (auto)"));
  assertTrue(lines[1].endsWith("gpt-test • high"));
  assertEquals(lines[2], "alpha two beta");
  const statPattern = /[↑↓]\d|\bR\d|\bCH\d|\$\d|\(sub\)/;
  const text = lines.join("\n");
  assertTrue(!statPattern.test(text), `footer should not show stats: ${text}`);
});

test("starts without optional settings, session, branch, or model data", () => {
  // Arrange
  const harness = createHarness("tui", false);
  harness.state.model = undefined;
  harness.state.usage = undefined;
  harness.state.branch = undefined;
  harness.state.sessionName = undefined;

  // Act
  const lines = withHome("/Users/tester", () => {
    harness.startSession();
    return harness.mount().render(80);
  });

  // Assert
  assertEquals(lines[0], "~/work/app");
  assertTrue(lines[1].startsWith("?/0"));
  assertTrue(lines[1].endsWith("no-model"));
  assertTrue(!lines[1].includes("(auto)"));
});

test("reads model, context, thinking, and auto-compaction live from the factory context", () => {
  // Arrange
  const harness = createHarness();
  harness.startSession();
  const footer = harness.mount();
  assertTrue(footer.render(80)[1].endsWith("gpt-test • high"));

  // Act
  harness.state.usage = {
    tokens: 150_000,
    contextWindow: 1_000_000,
    percent: 15,
  };
  harness.state.model = {
    id: "claude-test",
    provider: "anthropic",
    contextWindow: 1_000_000,
    reasoning: true,
  };
  harness.state.thinking = "low";
  harness.state.autoCompact = false;
  const lines = footer.render(80);

  // Assert
  assertTrue(lines[1].startsWith("15.0%/1.0M"));
  assertTrue(!lines[1].includes("(auto)"));
  assertTrue(lines[1].endsWith("claude-test • low"));
});

test("shows an unknown percentage after compaction instead of zero", () => {
  // Arrange
  const harness = createHarness();
  harness.state.usage = { tokens: null, contextWindow: 200_000, percent: null };
  harness.startSession();

  // Act
  const line = harness.mount().render(80)[1];

  // Assert
  assertTrue(line.startsWith("?/200k (auto)"));
  assertTrue(!line.includes("0.0%"));
});

test("styles context usage by threshold, keeping ordinary usage dim", () => {
  // Arrange
  const harness = createHarness();
  harness.state.usage = { tokens: 1, contextWindow: 100_000, percent: 95 };
  harness.startSession();
  const footer = harness.mount(ansiTheme);

  // Act
  const high = footer.render(80)[1];
  harness.state.usage = { tokens: 1, contextWindow: 100_000, percent: 75 };
  const warning = footer.render(80)[1];
  harness.state.usage = { tokens: 1, contextWindow: 100_000, percent: 10 };
  const ordinary = footer.render(80)[1];

  // Assert
  assertTrue(high.includes("\x1b[31merror:95.0%/100k (auto)"));
  assertTrue(warning.includes("\x1b[31mwarning:75.0%/100k (auto)"));
  assertTrue(ordinary.includes("\x1b[31mdim:10.0%/100k (auto)"));
});

test("shows the provider only with several providers and drops it before the model", () => {
  // Arrange
  const harness = createHarness();
  harness.state.providerCount = 2;
  harness.startSession();
  const footer = harness.mount();

  // Act
  const wide = footer.render(80)[1];
  const narrow = footer.render(40)[1];
  harness.state.providerCount = 1;
  const single = footer.render(80)[1];

  // Assert
  assertTrue(wide.endsWith("(openai) gpt-test • high"));
  assertTrue(narrow.endsWith("gpt-test • high"));
  assertTrue(!narrow.includes("openai"));
  assertTrue(!single.includes("openai"));
});

test("keeps every line within narrow, wide-character, and colored widths", () => {
  // Arrange
  const harness = createHarness();
  harness.state.cwd = "/Users/tester/日本語/プロジェクト-very-long-name";
  harness.state.model = {
    id: "モデル-long-name",
    provider: "openai",
    contextWindow: 200_000,
    reasoning: true,
  };
  harness.state.statuses = new Map([["x", "統計 status 日本語 entries"]]);
  harness.startSession();
  const footer = harness.mount(ansiTheme);

  // Act
  const widths = [1, 8, 20, 40];
  const rendered = widths.map((width) => ({
    width,
    lines: footer.render(width),
  }));

  // Assert
  for (const { width, lines } of rendered) {
    assertTrue(lines.length >= 2, `footer should render at width ${width}`);
    for (const line of lines) {
      assertTrue(
        visibleWidth(line) <= width,
        `line exceeds width ${width}: ${line}`,
      );
    }
    if (width >= 20) {
      assertTrue(
        stripVTControlCharacters(lines[0] + lines[1]).includes("12.5%/200k"),
        `context should stay visible at width ${width}`,
      );
    }
  }
});

test("does not install a custom footer outside TUI mode", () => {
  // Arrange
  const harness = createHarness("print");

  // Act
  harness.startSession();

  // Assert
  assertEquals(harness.getFactory(), undefined);
});

test("restores the built-in footer on shutdown so a stale session context is never rendered", () => {
  // Arrange
  const harness = createHarness();
  harness.startSession();
  assertTrue(harness.getFactory(), "a custom footer should be installed");

  // Act
  harness.shutdownSession();

  // Assert
  assertEquals(harness.getFactory(), undefined);
});

test("stops requesting renders after the footer is disposed", () => {
  // Arrange
  const harness = createHarness();
  harness.startSession();
  const footer = harness.mount();

  // Act
  harness.triggerBranchChange();
  const rendersWhileMounted = harness.renderRequests;
  footer.dispose?.();
  harness.triggerBranchChange();

  // Assert
  assertEquals(rendersWhileMounted, 1);
  assertEquals(harness.renderRequests, 1);
});
