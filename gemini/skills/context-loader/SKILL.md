---
name: context-loader
description: Load project context from .claude/ directory at the start of every task.
---

# Context Loader Skill for Gemini

## Purpose

Load shared project context from `~/.claude/` directory.

## When to Activate

**ALWAYS** - Run at the beginning of research/analysis tasks.

## Workflow

1. Identify project name from current directory (e.g., `basename $(pwd)`)
2. Read `~/.claude/rules/` for global coding rules
3. Read `~/.claude/docs/projects/{project-name}/DESIGN.md` for project design decisions
4. Check `~/.claude/docs/projects/{project-name}/libraries/` for library constraints
5. Execute research with loaded context

## Directory Structure

```
~/.claude/docs/
  ├── research/              # Global research results
  └── projects/
      └── {project-name}/
          ├── DESIGN.md      # Project design decisions
          └── libraries/     # Library docs & constraints
```

## Language Protocol

- **Thinking/Reasoning**: English
- **Code examples**: English
- **Output**: Structured markdown

## Output Guidelines

- Structure with clear headings
- Include code examples when relevant
- Save global findings to `~/.claude/docs/research/`
- Save project-specific findings to `~/.claude/docs/projects/{project-name}/`
