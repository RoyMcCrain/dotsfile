---
title: "Git comparison - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/git-comparison/index"
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
  + Git comparison

    [Git comparison](https://www.jj-vcs.dev/latest/git-comparison/index.html)

    Table of contents
    - [Introduction](https://www.jj-vcs.dev/latest/git-comparison/index.html#introduction)
    - [Overview](https://www.jj-vcs.dev/latest/git-comparison/index.html#overview)
    - [The index](https://www.jj-vcs.dev/latest/git-comparison/index.html#the-index)
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

* [Introduction](https://www.jj-vcs.dev/latest/git-comparison/index.html#introduction)
* [Overview](https://www.jj-vcs.dev/latest/git-comparison/index.html#overview)
* [The index](https://www.jj-vcs.dev/latest/git-comparison/index.html#the-index)

# Comparison with Git[¶](https://www.jj-vcs.dev/latest/git-comparison/index.html#comparison-with-git "Permanent link")

## Introduction[¶](https://www.jj-vcs.dev/latest/git-comparison/index.html#introduction "Permanent link")

This document attempts to describe how Jujutsu is different from Git. See
[the Git-compatibility doc](https://www.jj-vcs.dev/latest/git-compatibility/index.html) for information about how
the `jj` command interoperates with Git repos. See
[the Git command table](https://www.jj-vcs.dev/latest/git-command-table/index.html) for a table of similar commands.

## Overview[¶](https://www.jj-vcs.dev/latest/git-comparison/index.html#overview "Permanent link")

Here is a list of conceptual differences between Jujutsu and Git, along with
links to more details where applicable and available. There's a
[table](https://www.jj-vcs.dev/latest/git-command-table/index.html) explaining how to achieve various use cases.

* **The working copy is automatically committed.** That results in a simpler and
  more consistent CLI because the working copy is now treated like any other
  commit. [Details](https://www.jj-vcs.dev/latest/working-copy/index.html).
* **There's no index (staging area).** Because the working copy is automatically
  committed, an index-like concept doesn't make sense. The index is very similar
  to an intermediate commit between `HEAD` and the working copy, so workflows
  that depend on it can be modeled using proper commits instead. Jujutsu has
  excellent support for moving changes between commits. [Details](https://www.jj-vcs.dev/latest/git-comparison/index.html#the-index).
* **No need for branch names (but they are supported as
  [bookmarks](https://www.jj-vcs.dev/latest/glossary/index.html#bookmark)).** Git lets you check out a commit without
  attaching a branch to it. It calls this state "detached HEAD". This is the
  normal state in Jujutsu (there's actually no way -- yet, at least -- to have
  an active branch/bookmark). However, Jujutsu keeps track of all visible heads
  (leaves) of the commit graph, so the commits won't get lost or
  garbage-collected.
* **No current branch.** Git lets you check out a branch, making it the 'current
  branch', and new commits will automatically update the branch. This is
  necessary in Git because Git might otherwise lose track of the new commits.

  Jujutsu does not have a corresponding concept of a 'current bookmark';
  instead, you update bookmarks manually. For example, if you start work on top
  of a commit with a bookmark, new commits are created on top of the bookmark,
  then you issue a later command to update the bookmark.
* **Conflicts can be committed.** No commands fail because of merge conflicts.
  The conflicts are instead recorded in commits and you can resolve them later.
  [Details](https://www.jj-vcs.dev/latest/conflicts/index.html). This lets us rebase conflict and conflict
  resolutions, and thereby addressing most `git rerere` use cases.
* **Descendant commits are automatically rebased.** Whenever you rewrite a
  commit (e.g. by running `jj rebase`), all its descendants commits will
  automatically be rebased on top. Branches pointing to it will also get
  updated, and so will the working copy if it points to any of the rebased
  commits.
* **No "evil merges".** In Git, a merge commit that contains changes that are
  not in any parent are called [evil merges](https://git-scm.com/docs/gitglossary#Documentation/gitglossary.txt-evilmerge). We believe the reason for this
  opinionated term is that Git has historically not been very good at working
  with such commits. For example, `git show` doesn't show them well (without
  `--remerge-diff` from 2022), and `git rebase` drops the changes (without
  `--rebase-merges` from 2018). Jujutsu defines the changes in a commit as
  being relative to the auto-merged parents in all contexts, so you can safely
  include change in merge commits.
* **Bookmarks/branches are identified by their names (across remotes).** For
  example, if you pull from a remote that has a `main` branch, you'll get a
  bookmark by that name in your local repo. If you then move it and push back to
  the remote, the `main` branch on the remote will be updated.
  [Details](https://www.jj-vcs.dev/latest/bookmarks/index.html).
* **The operation log replaces reflogs.** The operation log is similar to
  reflogs, but is much more powerful. It keeps track of atomic updates to all
  refs at once (Jujutsu thus improves on Git's per-ref history much in the same
  way that Subversion improved on RCS's per-file history). The operation log
  powers e.g. the undo functionality. [Details](https://www.jj-vcs.dev/latest/operation-log/index.html)
* **There's a single, virtual root commit.** Like Mercurial, Jujutsu has a
  virtual commit (with a hash consisting of only zeros) called the "root commit"
  (called the "null revision" in Mercurial). This commit is a common ancestor of
  all commits. That removes the awkward state Git calls the "unborn branch"
  state (which is the state a newly initialized Git repo is in), and related
  command-line flags (e.g. `git rebase --root`, `git checkout --orphan`).

## The index[¶](https://www.jj-vcs.dev/latest/git-comparison/index.html#the-index "Permanent link")

Git's ["index"](https://git-scm.com/book/en/v2/Git-Tools-Reset-Demystified) has
multiple roles. One role is as a cache of file system information. Jujutsu has
something similar. Unfortunately, Git exposes the index to the user, which makes
the CLI unnecessarily complicated (learning what the different flavors of
`git reset` do, especially when combined with commits and/or paths, usually
takes a while). Jujutsu, like Mercurial, doesn't make that mistake.

As a Git power-user, you may think that you need the power of the index to
commit only part of the working copy. However, Jujutsu provides commands for
more directly achieving most use cases you're used to using Git's index for. For
example, to create a commit from part of the changes in the working copy, you
might be used to using `git add -p; git commit`. With Jujutsu, you'd instead
use `jj split` to split the working-copy commit into two commits. To add more
changes into the parent commit, which you might normally use
`git add -p; git commit --amend` for, you can instead use `jj squash -i` to
choose which changes to move into the parent commit, or `jj squash <file>` to
move a specific file.
