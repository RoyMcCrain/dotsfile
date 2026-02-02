---
title: "Sapling comparison - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/sapling-comparison/index"
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
  + [Fileset language](https://www.jj-vcs.dev/latest/filesets/index.html)
  + [Revset language](https://www.jj-vcs.dev/latest/revsets/index.html)
  + [Templating language](https://www.jj-vcs.dev/latest/templates/index.html)
* Comparisons

  Comparisons
  + [Git comparison](https://www.jj-vcs.dev/latest/git-comparison/index.html)
  + [Git command table](https://www.jj-vcs.dev/latest/git-command-table/index.html)
  + [Git compatibility](https://www.jj-vcs.dev/latest/git-compatibility/index.html)
  + [Jujutsu for Git experts](https://www.jj-vcs.dev/latest/git-experts/index.html)
  + Sapling comparison

    [Sapling comparison](https://www.jj-vcs.dev/latest/sapling-comparison/index.html)

    Table of contents
    - [Introduction](https://www.jj-vcs.dev/latest/sapling-comparison/index.html#introduction)
    - [Differences](https://www.jj-vcs.dev/latest/sapling-comparison/index.html#differences)
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

* [Introduction](https://www.jj-vcs.dev/latest/sapling-comparison/index.html#introduction)
* [Differences](https://www.jj-vcs.dev/latest/sapling-comparison/index.html#differences)

# Comparison with Sapling[¶](https://www.jj-vcs.dev/latest/sapling-comparison/index.html#comparison-with-sapling "Permanent link")

## Introduction[¶](https://www.jj-vcs.dev/latest/sapling-comparison/index.html#introduction "Permanent link")

This document attempts to describe how jj is different
from [Sapling](https://sapling-scm.com). Sapling is a VCS developed by Meta. It
was announced about 3 years after development started on jj. It is a heavily
modified fork of [Mercurial](https://www.mercurial-scm.org/). Because jj has
copied many ideas from Mercurial, there are many similarities between the two
tools, such as:

* A user-friendly CLI
* A "[revset](https://www.jj-vcs.dev/latest/revsets/index.html)" language for selecting revisions
* Good support for working with stacked commits, including tracking "anonymous
  heads" (no "detached HEAD" state like in Git) and `split` commands, and
  automatically rebasing descendant commits when you amend a commit.
* Flexible customization of output using [templates](https://www.jj-vcs.dev/latest/templates/index.html)

## Differences[¶](https://www.jj-vcs.dev/latest/sapling-comparison/index.html#differences "Permanent link")

Here is a list of some differences between jj and Sapling.

* **Working copy:** When using Sapling (like most VCSs), the
  user explicitly tells the tool when to create a commit and which files to
  include. When using jj, the working copy
  is [automatically snapshotted by every command](https://www.jj-vcs.dev/latest/working-copy/index.html). New files
  are automatically tracked and deleted files are automatically untracked. This
  has several advantages:

  + The working copy is effectively backed up every time you run a command.
  + No commands fail because you have changes in the working copy ("abort: 1
    conflicting file changes: ..."). No need for `sl shelve`.
  + Simpler and more consistent CLI because the working copy is treated like any
    other commit.
* **Conflicts:** Like most VCSs, Sapling requires the user to
  resolve conflicts before committing. jj lets
  you [commit conflicts](https://www.jj-vcs.dev/latest/conflicts/index.html). Note that it's a representation of the
  conflict that's committed, not conflict markers (`<<<<<<<` etc.). This also
  has several advantages:

  + Merge conflicts won't prevent you from checking out another commit.
  + You can resolve the conflicts when you feel like it.
  + Rebasing descendants always succeeds. Like jj, Sapling automatically
    rebases, but it will fail if there are conflicts.
  + Merge commits can be rebased correctly (Sapling sometimes fails).
  + You can rebase conflicts and conflict resolutions.
* **Undo:** jj's undo is powered by [the operation log](https://www.jj-vcs.dev/latest/operation-log/index.html), which
  records how the repo has changed over time. Sapling has a similar feature
  with its [MetaLog](https://sapling-scm.com/docs/internals/metalog).
  They seem to provide similar functionality, but jj also exposes the log to the
  user via `jj op log`, so you can tell how far back you want to go back.
  Sapling has `sl debugmetalog`, but that seems to show the history of a single
  commit, not the whole repo's history. Thanks to jj snapshotting the working
  copy, it's possible to undo changes to the working copy. For example, if
  you `jj undo` a `jj commit`, `jj diff` will show the same changes as
  before `jj commit`, but if you `sl undo` a `sl commit`, the working copy will
  be clean.
* **Git interop:** Sapling supports cloning, pushing, and pulling from a remote
  Git repo. jj also does, and it also supports sharing a working copy with a Git
  repo, so you can use `jj` and `git` interchangeably in the same repo.
* **Polish:** Sapling is more polished and feature-complete. Sapling has very
  nice built-in web UI called
  [Interactive Smartlog](https://sapling-scm.com/docs/addons/isl), which lets
  you drag and drop commits to rebase them, among other things.
* **Forge workflow:** Sapling has `sl pr submit --stack`, which lets you
  push a stack of commits as separate GitHub PRs, including setting the base
  branch. It only supports GitHub. jj doesn't have any direct integration with
  GitHub or any other forge. However, it has `jj git push --change` for
  automatically creating branches for specified commits. You have to specify
  each commit you want to create a branch for by using
  `jj git push --change X --change Y ...`, and you have to manually set up any
  base branches in GitHub's UI (or GitLab's or ...). On subsequent pushes, you
  can update all at once by specifying something like `jj git push -r main..@`
  (to push all branches on the current stack of commits from where it forked
  from `main`).
