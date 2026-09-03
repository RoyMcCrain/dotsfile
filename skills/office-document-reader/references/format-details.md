# Format conversion details

Reference for what MarkItDown Markdown output contains, what it loses, and when to use other tools.

This skill is **original documentation** for agent workflows. The converter is **not vendored** — it is installed at runtime via `uvx` or an existing `markitdown` CLI.

## Source

| Item | Value |
| ---- | ----- |
| Repository | https://github.com/microsoft/markitdown |
| Inspected source commit | `e57e33291f10e1bb9e3ae26885f735477994f48d` |
| Tested PyPI version | `markitdown 0.1.7` |
| License | MIT |

## Direct CLI

The wrapper uses this local conversion command and always writes to a file:

```bash
uvx --from 'markitdown[docx,pptx,xlsx]==0.1.7' markitdown -o ./output.md -- ./input.docx
```

If `markitdown` is already installed with the required extras, `markitdown -o OUTPUT -- INPUT` is equivalent. The wrapper rejects an explicit output path that already exists and, when OUTPUT is omitted, writes to a unique private directory under `${TMPDIR:-/tmp}/office-document-reader.XXXXXX/`. For application code that only accepts local paths, prefer MarkItDown's narrow `convert_local()` API.

## DOCX

### Markdown can contain

- Headings (via Mammoth/HTML pipeline)
- Paragraphs and inline formatting where supported
- Bulleted and numbered lists
- Tables (as Markdown tables)
- Hyperlinks

### Markdown cannot guarantee

- Exact page layout, margins, columns, or pagination
- Headers, footers, and page numbers
- Tracked changes and revision markup
- Comments and annotations
- Complex embedded objects (OLE, some SmartArt/diagrams)
- Text boxes positioned outside normal flow
- Fine-grained font/color styling

### When to switch tools

| Goal | Tool |
| ---- | ---- |
| Paragraph/table structure and style metadata | `python-docx` |
| Alternate Markdown conversion and tracked-change handling | `pandoc` (when already installed) |
| Comments, revision XML, or complex embedded content | Targeted OOXML inspection |
| Pixel-accurate page rendering | Render to PDF/images separately |

## PPTX

### Markdown can contain

- Slide markers: `<!-- Slide number: N -->`
- Slide titles and body text
- Tables on slides
- Supported chart data (as text/table)
- Speaker notes
- Image alt text or placeholders (not the actual image)

### Markdown cannot guarantee

- Visual slide layout, positioning, theme/animation, or guaranteed reading order
- Exact font sizes, colors, or master-slide fidelity
- Full fidelity for all chart types or SmartArt
- What the slide *looks like* — placeholders are not equivalent to seeing it

### When to switch tools

| Goal | Tool |
| ---- | ---- |
| Shapes, placeholders, notes, slide order | `python-pptx` |
| Appearance, colors, layout review | Render slides to images or PDF (separate workflow) |

## XLSX

### Markdown can contain

- Each worksheet as a section with a heading
- Cell values rendered as Markdown tables (for quick reading)

### Markdown cannot guarantee

- **Formulas** (only evaluated/displayed values may appear)
- Cell styling, number formats, conditional formatting
- Hidden sheets or filtered views
- Merged-cell semantics
- Macros or VBA
- Charts and pivot tables
- Exact cell coordinates (A1 notation) for auditing

**Caveat:** Markdown conversion is **not suitable** for preserving or auditing formulas, styling, hidden sheets, merged-cell semantics, macros, charts, or exact cell coordinates.

### When to switch tools

| Goal | Tool |
| ---- | ---- |
| Read formulas vs cached values | `openpyxl` (`data_only=False` vs `True`) |
| Sheet names, hidden sheets, styles | `openpyxl` |
| Coordinate-level auditing | `openpyxl` or spreadsheet-native tools |

## Security reminder

Use narrow local conversion only. MarkItDown plugins are disabled by default in this workflow — do not enable `--use-plugins` or cloud backends unless the user explicitly opts in.
