---
title: "Operation log - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/operation-log/index"
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
  + Operation log

    [Operation log](https://www.jj-vcs.dev/latest/operation-log/index.html)

    Table of contents
    - [Introduction](https://www.jj-vcs.dev/latest/operation-log/index.html#introduction)
    - [Divergent operations](https://www.jj-vcs.dev/latest/operation-log/index.html#divergent-operations)
    - [Loading an old version of the repo](https://www.jj-vcs.dev/latest/operation-log/index.html#loading-an-old-version-of-the-repo)
  + [Glossary](https://www.jj-vcs.dev/latest/glossary/index.html)
* Guides

  Guides
  + [CLI options for specifying revisions](https://www.jj-vcs.dev/latest/guides/cli-revision-options/index.html)
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

* [Introduction](https://www.jj-vcs.dev/latest/operation-log/index.html#introduction)
* [Divergent operations](https://www.jj-vcs.dev/latest/operation-log/index.html#divergent-operations)
* [Loading an old version of the repo](https://www.jj-vcs.dev/latest/operation-log/index.html#loading-an-old-version-of-the-repo)

# Operation log[¶](https://www.jj-vcs.dev/latest/operation-log/index.html#operation-log "Permanent link")

## Introduction[¶](https://www.jj-vcs.dev/latest/operation-log/index.html#introduction "Permanent link")

Jujutsu records each operation that modifies the repo in the "operation log".
You can see the log with `jj op log`. Each operation object contains a snapshot
of how the repo looked at the end of the operation. We call this snapshot a
"view" object. The view contains information about where each bookmark, tag, and
Git ref (in Git-backed repos) pointed, as well as the set of heads in the repo,
and the current working-copy commit in each workspace. The operation object also
(in addition to the view) contains pointers to the operation(s) immediately
before it, as well as metadata about the operation, such as timestamps,
username, hostname, description.

The operation log allows you to undo operations one-by-one (`jj undo`) or even
revert a specific one which isn't the most recent operation (`jj op revert`). It
also lets you restore the entire repo to the way it looked at an earlier point
(`jj op restore`).

When referring to operations, you can use `@` to represent the current
operation.

The following operators are supported:

* `x-`: Parents of `x` (e.g. `@-`)
* `x+`: Children of `x`

## Divergent operations[¶](https://www.jj-vcs.dev/latest/operation-log/index.html#divergent-operations "Permanent link")

One benefit of the operation log (and the reason for its creation) is that it
allows lock-free concurrency -- you can run concurrent `jj` commands without
corrupting the repo, even if you run the commands on different machines that
access the repo via a distributed file system (as long as the file system
guarantees that a write is only visible once previous writes are visible). When
you run a `jj` command, it will start by loading the repo at the latest
operation. It will not see any changes written by concurrent commands. If there
are conflicts, you will be informed of them by subsequent `jj st` and/or
`jj log` commands.

As an example, let's say you had started editing the description of a change and
then also update the contents of the change (maybe because you had forgotten the
editor). When you eventually close your editor, the command will succeed and
e.g. `jj log` will indicate that the change has diverged.

## Loading an old version of the repo[¶](https://www.jj-vcs.dev/latest/operation-log/index.html#loading-an-old-version-of-the-repo "Permanent link")

The top-level `--at-operation/--at-op` option allows you to load the repo at a
specific operation. This can be useful for understanding how your repo got into
the current state. It can be even more useful for understanding why someone
else's repo got into its current state.

When you use `--at-op`, the automatic snapshotting of the working copy will not
take place. When referring to a revision with the `@` symbol (as many commands
do by default), that will resolve to the working-copy commit recorded in the
operation's view (which is actually how it always works -- it's just the
snapshotting that's skipped with `--at-op`).

As a top-level option, `--at-op` can be passed to any command. However, you
will typically only want to run read-only commands. For example, `jj log`,
`jj st`, and `jj diff` all make sense. It's still possible to run e.g.
`jj --at-op=<some operation ID> describe`. That's equivalent to having started
`jj describe` back when the specified operation was the most recent operation
and then let it run until now (which can be done for that particular command by
not closing the editor). There's practically no good reason to do that other
than to simulate concurrent commands.
