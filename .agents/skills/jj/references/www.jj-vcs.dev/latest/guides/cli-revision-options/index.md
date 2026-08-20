---
title: "CLI options for specifying revisions - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/guides/cli-revision-options/index"
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
  + CLI options for specifying revisions

    [CLI options for specifying revisions](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html)

    Table of contents
    - [Summary](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#summary)
    - [Manipulating revisions](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#manipulating-revisions)

      * [Specifying destinations](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#specifying-destinations)
    - [Manipulating diffs and file contents](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#manipulating-diffs-and-file-contents)

      * [Special cases that use -r](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#special-cases-that-use-r)
      * [Special cases that don't use any option](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#special-cases-that-dont-use-any-option)
    - [Other special cases](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#other-special-cases)
  + [Divergent changes](https://www.jj-vcs.dev/latest/guides/divergence/index.html)
  + [Multiple remotes](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html)
* Reference

  Reference
  + [Settings](https://www.jj-vcs.dev/latest/config/index.html)
  + [Fileset language](https://www.jj-vcs.dev/latest/filesets/index.html)
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

* [Summary](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#summary)
* [Manipulating revisions](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#manipulating-revisions)

  + [Specifying destinations](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#specifying-destinations)
* [Manipulating diffs and file contents](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#manipulating-diffs-and-file-contents)

  + [Special cases that use -r](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#special-cases-that-use-r)
  + [Special cases that don't use any option](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#special-cases-that-dont-use-any-option)
* [Other special cases](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#other-special-cases)

# CLI options for specifying revisions[¶](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#cli-options-for-specifying-revisions "Permanent link")

Jujutsu has several CLI options for selecting revisions. They are used
consistently, but it can be difficult to remember when each one is used.

This document explains the difference between each option.

## Summary[¶](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#summary "Permanent link")

These flags are used to specify the sources of the operation:

| Long flag | Short flag | Description |
| --- | --- | --- |
| `--revision` (or `--revisions`) | `-r` | The default, especially for commands that don't need to specify a destination. |
| `--source` | `-s` | The specified revision and all its descendants. |
| `--from` | `-f` | The *contents* of a revision. |
| `--branch` | `-b` | A whole branch, relative to the destination. |

These flags are used when commands need both a "source" revision and a
"destination" revision:

| Long flag | Short flag | Description |
| --- | --- | --- |
| `--onto` | `-o` | Create children of the specified revisions. |
| `--insert-after` | `-A` | Insert *between* the specified revisions and their children. |
| `--insert-before` | `-B` | Insert *between* the specified revisions and their parents. |
| `--to`, `--into` | `-t` | Which revision to place the selected *contents*. |

## Manipulating revisions[¶](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#manipulating-revisions "Permanent link")

Most commands accept a revset with `-r`. This selects the revisions in the
revset, and no more. Examples: `jj log -r REV` displays revisions in `REV`, `jj
split -r REV` splits revision `REV` into multiple revisions.

`--source` (`-s`) is used with commands that manipulate revisions *and their
descendants*. `-s REV` is essentially identical to `-r REV::`.

Examples of `-r` and `-s`:

* `jj log -r xyz` displays revision `xyz`.
* `jj fix -s xyz` runs fix tools on files in `xyz` and all of its descendants.
  This command *must* operate on all of a revision's descendants, so it accepts
  `-s` and not `-r` to communicate this fact.

### Specifying destinations[¶](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#specifying-destinations "Permanent link")

Commands that move revisions around also need to specify the destinations.

* `--onto REV` (`-o REV`) places revisions as children of `REV`.
* `--insert-after REV` (`-A REV`) inserts revisions as children of `REV` and parents of `REV+`.
* `--insert-before REV` (`-B REV`) inserts revisions as the children of `REV-` and parents of `REV`.

Examples:

* `jj rebase -r REV -o main` rebases revisions in `REV` as children of `main`.
* `jj rebase -r REV -B yyy` inserts revisions `REV` between `yyy` and its parents.
* `jj rebase -r REV -A main -B yyy` inserts revisions `REV` between `main` and `yyy`.
* `jj revert -r xyz -o main` creates a revision that reverts `xyz` then rebases it on top of `main`.

## Manipulating diffs and file contents[¶](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#manipulating-diffs-and-file-contents "Permanent link")

Commands that view or manipulate the *contents* of revisions use `--from` and
`--to` (or `--into`).

Examples:

* `jj diff --from F --to T` compares the files at revision `F` to the files at
  revision `T`.
* `jj restore --from F --to T` copies file contents from `F` to `T`.
* `jj squash --from F --into T` moves the file changes from `F` to `T`.

Info

Commands that accept `--into` also accept `--to`. You can always use `--to`
if you're not sure which to use.

They both exist because "into" makes some commands read more clearly in
English. For example, `jj squash --from X --into Y`.

### Special cases that use `-r`[¶](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#special-cases-that-use-r "Permanent link")

Some commands manipulate revision contents but allow for `-r`. This means
"compared with its parent". For example, `jj diff -r R` means "compare revision
`R` to its parent `R-`".

### Special cases that don't use any option[¶](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#special-cases-that-dont-use-any-option "Permanent link")

Most commands accept revisions as options and paths as positional parameters.
For example, the command to display the diff of a specific file in a specific
revision is:

```
$ jj diff -r REV file.txt
```

However, some commands cannot accept paths, so they allow omitting the `-r`
flag. For example, the canonical command would be `jj new -r xyz`, but this
command is so common that Jujutsu allows `jj new xyz`.

The commands that allow omitting the `-r` are:

* `jj abandon`
* `jj describe`
* `jj duplicate`
* `jj metaedit`
* `jj new`
* `jj parallelize`
* `jj show`

## Other special cases[¶](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html#other-special-cases "Permanent link")

`jj git push --change REV` (`-c REV`) means (a) create a new bookmark with a
generated name, and (b) immediately push it to the remote.

`jj restore --changes-in REV` (`-c REV`) means, "remove any changes to the given
files in `REV`". This doesn't use `-r` because `jj restore -r REV` might seem
like it would restore files *from* `REV` into the working copy.

`jj rebase --branch REV` (`-b REV`) rebases a topological branch of revisions
with respect to some base. This is a convenience for a very common operation.
These commands are equivalent:

* `jj rebase -o main -b @`
* `jj rebase -o main -r (main..@)::`
* `jj rebase -o main -s roots(main..@)`
* `jj rebase -o main` (this is so common that `-b @` is the default "source" of
  a rebase if unspecified)
