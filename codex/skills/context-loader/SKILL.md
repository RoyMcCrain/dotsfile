---
name: context-loader
description: Load project context from .claude/ directory at the start of every task.
---

# Context Loader Skill

## Purpose

Load shared project context from `~/.claude/` directory.

## When to Activate

**ALWAYS** - Run at the beginning of every task.

## Workflow

1. Identify project name from current directory (e.g., `basename $(pwd)`)
2. Read `~/.claude/rules/` for global coding rules
3. Read `~/.claude/docs/projects/{project-name}/DESIGN.md` for project design decisions
4. Check `~/.claude/docs/projects/{project-name}/libraries/` for library constraints
5. Execute task with loaded context

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
- **Code**: English
- **User communication**: Japanese

## Output

After loading context, confirm:
- Rules loaded
- Project context loaded (if exists)
- Ready to execute task
