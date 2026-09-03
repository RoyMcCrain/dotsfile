---
name: firecrawl-parse
description: |
  Efficiently extract and convert local files—such as PDF, DOC, ODT, RTF, XLS, or HTML—into clean, well-formatted markdown saved to disk. Use when the user requests to parse, read, or extract information from a supported local file (not a URL), including phrases like “parse this PDF”, “convert this document”, “read this file”, or “extract text from”. Offers AI-powered summaries and query options. For local DOCX, PPTX, or XLSX, prefer office-document-reader (local MarkItDown). Firecrawl parse remains available for DOCX/XLSX only when the user explicitly requests Firecrawl or needs its AI summary/query options. Does not support PPTX.
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# firecrawl parse

Turn a local document into clean markdown on disk.

**Routing:** Use Firecrawl parse normally for **PDF, DOC, ODT, RTF, XLS, HTML/HTM/XHTML**. For local **DOCX** or **XLSX**, prefer [office-document-reader](../office-document-reader/SKILL.md) (local MarkItDown) unless the user explicitly requests Firecrawl or needs Firecrawl AI summary/query (`-S`, `-Q`). **PPTX is not supported** by Firecrawl — use office-document-reader for local PowerPoint files.

## When to use

- You have a supported file on disk (not a URL) and want its text as markdown
- User drops a PDF/DOC and asks what it says, or to summarize it with Firecrawl AI options
- Use `scrape` instead when the source is a URL
- **Not for PPTX** — use office-document-reader for local PowerPoint files

## Quick start

Always save to `.firecrawl/` with `-o` — parsed docs can be hundreds of KB and blow up context if streamed to stdout. Add `.firecrawl/` to `.gitignore`.

```bash
mkdir -p .firecrawl

# File → markdown
firecrawl parse ./paper.pdf -o .firecrawl/paper.md

# AI summary
firecrawl parse ./paper.pdf -S -o .firecrawl/paper-summary.md

# Ask a question about the doc
firecrawl parse ./paper.pdf -Q "What are the main conclusions?" \
  -o .firecrawl/paper-qa.md
```

Then `head`, `grep`, `rg` etc., or incrementally read the file - don't load the whole thing at once.

## Options

| Option                 | Description                             |
| ---------------------- | --------------------------------------- |
| `-S, --summary`        | AI-generated summary                    |
| `-Q, --query <prompt>` | Ask a question about the parsed content |
| `-o, --output <path>`  | Output file path — **always use this**  |
| `-f, --format <fmt>`   | `markdown` (default), `html`, `summary` |
| `--timeout <ms>`       | Timeout for the parse job               |
| `--timing`             | Show request duration                   |

## Tips

- Quote paths with spaces: `firecrawl parse "./My Doc.pdf" -o .firecrawl/mydoc.md`.
- Max upload size: **50 MB** per file.
- Credits: ~1 per PDF page; HTML is 1 flat.
- Check `.firecrawl/` before re-parsing the same file.
- To check your credit balance (recommended for batch processing and similar workflows), use the `firecrawl credit-usage` command.

## See also

- [office-document-reader](../office-document-reader/SKILL.md) — preferred for local DOCX, PPTX, XLSX conversion
- [firecrawl-scrape](../firecrawl-scrape/SKILL.md) — same idea for URLs
