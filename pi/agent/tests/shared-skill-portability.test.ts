import { assertMatch, assertStringIncludes } from "jsr:@std/assert@1.0";

const SKILLS_ROOT = new URL("../../../skills/", import.meta.url);
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FIRECRAWL_ALLOWED_TOOLS = `allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)`;

const CROSS_RESEARCH_ALLOWED_TOOLS = `allowed-tools:
  - Bash(agy *)
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
  - Bash(~/.agents/skills/cross-research/scripts/grok-x-search.sh *)
  - Bash(jq *)`;

const EXPECTED_ALLOWED_TOOLS: Record<string, string> = {
  "clerk-backend-api/SKILL.md":
    "allowed-tools: Bash, Read, Grep, Skill, WebFetch",
  "clerk-custom-ui/SKILL.md": "allowed-tools: WebFetch",
  "clerk-orgs/SKILL.md": "allowed-tools: WebFetch",
  "clerk-react-patterns/SKILL.md": "allowed-tools: WebFetch",
  "clerk-react-router-patterns/SKILL.md": "allowed-tools: WebFetch",
  "clerk-setup/SKILL.md": "allowed-tools: WebFetch",
  "clerk-tanstack-patterns/SKILL.md": "allowed-tools: WebFetch",
  "clerk-testing/SKILL.md": "allowed-tools: WebFetch",
  "clerk-webhooks/SKILL.md": "allowed-tools: WebFetch",
  "cross-research/SKILL.md": CROSS_RESEARCH_ALLOWED_TOOLS,
  "firecrawl-agent/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
  "firecrawl-cli/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
  "firecrawl-crawl/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
  "firecrawl-download/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
  "firecrawl-interact/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
  "firecrawl-map/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
  "firecrawl-monitor/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
  "firecrawl-parse/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
  "firecrawl-scrape/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
  "firecrawl-search/SKILL.md": FIRECRAWL_ALLOWED_TOOLS,
};

const collectSkillFiles = async (root: string) => {
  const dirs = [root];
  const files: string[] = [];

  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir === undefined) {
      continue;
    }

    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        dirs.push(path);
        continue;
      }
      if (entry.isFile && entry.name === "SKILL.md") {
        files.push(path);
      }
    }
  }

  return files;
};

const extractFrontmatter = (content: string) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("missing frontmatter");
  }
  return match[1];
};

const extractName = (frontmatter: string) => {
  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^name:\s*(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
};

const relativeSkillPath = (absolutePath: string) => {
  const rootPath = decodeURIComponent(SKILLS_ROOT.pathname);
  return absolutePath.slice(rootPath.length);
};

Deno.test("shared skill frontmatter names use Agent Skills syntax", async () => {
  const rootPath = decodeURIComponent(SKILLS_ROOT.pathname);

  for (const skillPath of await collectSkillFiles(rootPath)) {
    const content = await Deno.readTextFile(skillPath);
    const frontmatter = extractFrontmatter(content);
    const name = extractName(frontmatter);
    const relativePath = relativeSkillPath(skillPath);

    if (name === undefined) {
      throw new Error(`${relativePath}: missing frontmatter name`);
    }

    assertMatch(
      name,
      SKILL_NAME_PATTERN,
      `${relativePath}: invalid skill name "${name}"`,
    );
  }
});

Deno.test("restored shared skills retain exact allowed-tools blocks", async () => {
  const rootPath = decodeURIComponent(SKILLS_ROOT.pathname);

  for (
    const [relativePath, expectedBlock] of Object.entries(
      EXPECTED_ALLOWED_TOOLS,
    )
  ) {
    const absolutePath = `${rootPath}${relativePath}`;
    const content = await Deno.readTextFile(absolutePath);
    const frontmatter = extractFrontmatter(content);

    assertStringIncludes(
      frontmatter,
      expectedBlock,
      `${relativePath}: missing expected allowed-tools block`,
    );
  }
});
