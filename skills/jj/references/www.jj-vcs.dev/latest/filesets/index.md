---
title: "Fileset language - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/filesets/index"
fetched_at: "2026-02-02T08:21:03.339661+00:00"
---



Jujutsu docs

[jj-vcs/jj](https://github.com/jj-vcs/jj "Go to repository")

* [Home](https://www.jj-vcs.dev/latest/index.html)
* Getting started

  Getting started
  + [Installation and setup](https://www.jj-vcs.dev/latest/install-and-setup/index.html)
  + [Tutorial and bird's eye view](https://www.jj-vcs.dev/latest/tutorial/index.html)
  + [Working with Gerrit](https://www.jj-vcs.dev/latest/gerrit/index.html)
  + [Working with GitHub](https://www.jj-vcs.dev/latest/github/index.html)
  + [Working on Windows](https://www.jj-vcs.dev/latest/windows/index.html)
* [FAQ](https://www.jj-vcs.dev/latest/FAQ/index.html)
* [CLI reference](https://www.jj-vcs.dev/latest/cli-reference/index.html)
* [Testimonials](https://www.jj-vcs.dev/latest/testimonials/index.html)
* [Community-built tools](https://www.jj-vcs.dev/latest/community_tools/index.html)
* Concepts

  Concepts
  + [Working copy](https://www.jj-vcs.dev/latest/working-copy/index.html)
  + [Bookmarks](https://www.jj-vcs.dev/latest/bookmarks/index.html)
  + [Conflicts](https://www.jj-vcs.dev/latest/conflicts/index.html)
  + [Operation log](https://www.jj-vcs.dev/latest/operation-log/index.html)
  + [Glossary](https://www.jj-vcs.dev/latest/glossary/index.html)
* Guides

  Guides
  + [CLI options for specifying revisions](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html)
  + [Divergent changes](https://www.jj-vcs.dev/latest/guides/divergence/index.html)
  + [Multiple remotes](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html)
* Reference

  Reference
  + [Settings](https://www.jj-vcs.dev/latest/config/index.html)
  + Fileset language

    [Fileset language](https://www.jj-vcs.dev/latest/filesets/index.html)

    Table of contents
    - [Quoting file names](https://www.jj-vcs.dev/latest/filesets/index.html#quoting-file-names)
    - [File patterns](https://www.jj-vcs.dev/latest/filesets/index.html#file-patterns)
    - [Operators](https://www.jj-vcs.dev/latest/filesets/index.html#operators)
    - [Functions](https://www.jj-vcs.dev/latest/filesets/index.html#functions)
    - [Examples](https://www.jj-vcs.dev/latest/filesets/index.html#examples)
  + [Revset language](https://www.jj-vcs.dev/latest/revsets/index.html)
  + [Templating language](https://www.jj-vcs.dev/latest/templates/index.html)
* Comparisons

  Comparisons
  + [Git comparison](https://www.jj-vcs.dev/latest/git-comparison/index.html)
  + [Git command table](https://www.jj-vcs.dev/latest/git-command-table/index.html)
  + [Git compatibility](https://www.jj-vcs.dev/latest/git-compatibility/index.html)
  + [Jujutsu for Git experts](https://www.jj-vcs.dev/latest/git-experts/index.html)
  + [Sapling comparison](https://www.jj-vcs.dev/latest/sapling-comparison/index.html)
  + [Other related work](https://www.jj-vcs.dev/latest/related-work/index.html)
* Technical details

  Technical details
  + [Core tenets](https://www.jj-vcs.dev/latest/core_tenets/index.html)
  + [Architecture](https://www.jj-vcs.dev/latest/technical/architecture/index.html)
  + [Concurrency](https://www.jj-vcs.dev/latest/technical/concurrency/index.html)
  + [Conflicts](https://www.jj-vcs.dev/latest/technical/conflicts/index.html)
* Contributing

  Contributing
  + [Guidelines and "How to...?"](https://www.jj-vcs.dev/latest/contributing/index.html)
  + [Code of conduct](https://www.jj-vcs.dev/latest/code-of-conduct/index.html)
  + [Style guide](https://www.jj-vcs.dev/latest/style_guide/index.html)
  + [Design docs](https://www.jj-vcs.dev/latest/design_docs/index.html)
  + [Design doc blueprint](https://www.jj-vcs.dev/latest/design_doc_blueprint/index.html)
  + [Releasing](https://www.jj-vcs.dev/latest/releasing/index.html)
  + [Temporary voting for governance](https://www.jj-vcs.dev/latest/governance/temporary-voting/index.html)
  + [Governance](https://www.jj-vcs.dev/latest/governance/GOVERNANCE/index.html)
* Design docs

  Design docs
  + [git-submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html)
  + [git-submodule-storage](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html)
  + [JJ run](https://www.jj-vcs.dev/latest/design/run/index.html)
  + [Sparse patterns v2](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html)
  + [Tracking branches](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html)
  + [Copy tracking and tracing](https://www.jj-vcs.dev/latest/design/copy-tracking/index.html)
  + [Secure config](https://www.jj-vcs.dev/latest/design/secure-config/index.html)
* [Development roadmap](https://www.jj-vcs.dev/latest/roadmap/index.html)
* [Changelog](https://www.jj-vcs.dev/latest/changelog/index.html)

Table of contents

* [Quoting file names](https://www.jj-vcs.dev/latest/filesets/index.html#quoting-file-names)
* [File patterns](https://www.jj-vcs.dev/latest/filesets/index.html#file-patterns)
* [Operators](https://www.jj-vcs.dev/latest/filesets/index.html#operators)
* [Functions](https://www.jj-vcs.dev/latest/filesets/index.html#functions)
* [Examples](https://www.jj-vcs.dev/latest/filesets/index.html#examples)

# Filesets[¶](https://www.jj-vcs.dev/latest/filesets/index.html#filesets "Permanent link")

Jujutsu supports a functional language for selecting a set of files.
Expressions in this language are called "filesets" (the idea comes from
[Mercurial](https://repo.mercurial-scm.org/hg/help/filesets)). The language
consists of file patterns, operators, and functions.

## Quoting file names[¶](https://www.jj-vcs.dev/latest/filesets/index.html#quoting-file-names "Permanent link")

Many `jj` commands accept fileset expressions as positional arguments. File
names passed to these commands [must be quoted](https://www.jj-vcs.dev/latest/templates/index.html#stringliteral-type) if they contain
whitespace or meta characters. However, as a special case, quotes can be omitted
if the expression has no operators nor function calls. For example:

* `jj diff 'Foo Bar'` (shell quotes are required, but inner quotes are optional)
* `jj diff '~"Foo Bar"'` (both shell and inner quotes are required)
* `jj diff '"Foo(1)"'` (both shell and inner quotes are required)

Glob characters aren't considered meta characters, but shell quotes are still
required:

* `jj diff '~glob:**/*.rs'`

## File patterns[¶](https://www.jj-vcs.dev/latest/filesets/index.html#file-patterns "Permanent link")

The following patterns are supported. In all cases, we do not mention any shell
quoting that might be necessary, and the quotes around `"path"` are optional if
the path [has no special characters](https://www.jj-vcs.dev/latest/filesets/index.html#quoting-file-names).

By default, `"path"` is parsed as a `prefix-glob:` pattern, which matches
cwd-relative path prefix.

* `cwd:"path"`: Matches cwd-relative path prefix (file or files under directory
  recursively.)
* `file:"path"` or `cwd-file:"path"`: Matches cwd-relative file (or exact) path.
* `glob:"pattern"` or `cwd-glob:"pattern"`: Matches file paths with cwd-relative
  Unix-style shell [wildcard `pattern`](https://docs.rs/globset/latest/globset/#syntax). For example, `glob:"*.c"` will
  match all `.c` files in the current working directory non-recursively.
* `prefix-glob:"pattern"` or `cwd-prefix-glob:"pattern"`: Like `glob:`, but also
  matches path prefix (file or files under directory recursively.) For example,
  `prefix-glob:"*.d"` is equivalent to `glob:"*.d" | glob:"*.d/**"`.
* `root:"path"`: Matches workspace-relative path prefix (file or files under
  directory recursively.)
* `root-file:"path"`: Matches workspace-relative file (or exact) path.
* `root-glob:"pattern"`: Matches file paths with workspace-relative Unix-style
  shell [wildcard `pattern`](https://docs.rs/globset/latest/globset/#syntax).
* `root-prefix-glob:"pattern"`: Like `root-glob:`, but also matches path prefix
  (file or files under directory recursively.)

Glob patterns support case-insensitive matching by appending `-i` to the pattern
name. For example, `glob-i:"*.TXT"` will match both `file.txt` and `FILE.TXT`.

## Operators[¶](https://www.jj-vcs.dev/latest/filesets/index.html#operators "Permanent link")

The following operators are supported. `x` and `y` below can be any fileset
expressions.

* `~x`: Matches everything but `x`.
* `x & y`: Matches both `x` and `y`.
* `x ~ y`: Matches `x` but not `y`.
* `x | y`: Matches either `x` or `y` (or both).

(listed in order of binding strengths)

You can use parentheses to control evaluation order, such as `(x & y) | z` or
`x & (y | z)`.

## Functions[¶](https://www.jj-vcs.dev/latest/filesets/index.html#functions "Permanent link")

You can also specify patterns by using functions.

* `all()`: Matches everything.
* `none()`: Matches nothing.

## Examples[¶](https://www.jj-vcs.dev/latest/filesets/index.html#examples "Permanent link")

Show diff excluding `Cargo.lock`.

```
jj diff '~Cargo.lock'
```

List files in `src` excluding Rust sources.

```
jj file list 'src ~ glob:"**/*.rs"'
```

Split a revision in two, putting `foo` into the second commit.

```
jj split '~foo'
```
