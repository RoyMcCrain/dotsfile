---
title: "Conflicts - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/technical/conflicts/index"
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
  + [Sapling comparison](https://www.jj-vcs.dev/latest/sapling-comparison/index.html)
  + [Other related work](https://www.jj-vcs.dev/latest/related-work/index.html)
* Technical details

  Technical details
  + [Core tenets](https://www.jj-vcs.dev/latest/core_tenets/index.html)
  + [Architecture](https://www.jj-vcs.dev/latest/technical/architecture/index.html)
  + [Concurrency](https://www.jj-vcs.dev/latest/technical/concurrency/index.html)
  + Conflicts

    [Conflicts](https://www.jj-vcs.dev/latest/technical/conflicts/index.html)

    Table of contents
    - [Introduction](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#introduction)
    - [Data model](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#data-model)
    - [Conflict simplification](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#conflict-simplification)
    - [Same-change rule](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#same-change-rule)
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

* [Introduction](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#introduction)
* [Data model](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#data-model)
* [Conflict simplification](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#conflict-simplification)
* [Same-change rule](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#same-change-rule)

# First-class conflicts[¶](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#first-class-conflicts "Permanent link")

## Introduction[¶](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#introduction "Permanent link")

Conflicts can happen when two changes are applied to some state. This document
is about conflicts between changes to files (not about [conflicts between
changes to bookmark targets](https://www.jj-vcs.dev/latest/technical/concurrency/index.html), for example).

For example, if you merge two branches in a repo, there may be conflicting
changes between the two branches. Most DVCSs require you to resolve those
conflicts before you can finish the merge operation. Jujutsu instead records
the conflicts in the commit and lets you resolve the conflict when you feel like
it.

## Data model[¶](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#data-model "Permanent link")

When a merge conflict happens, it is recorded as an ordered list of tree objects
linked from the commit (instead of the usual single tree per commit). There will
always be an odd number of trees linked from the commit. You can think of the
first tree as a start tree, and the subsequent pairs of trees to apply the diff
between onto the start. Examples:

* If the commit has trees A, B, C, D, and E it means that the contents should be
  calculated as A+(C-B)+(E-D).
* A three-way merge between A and C with B as base can be represented as a
  commit with trees A, B, and C, also known as A+(C-B).

The resulting tree contents is calculated on demand. Note that we often don't
need to merge the entire tree. For example, when checking out a commit in the
working copy, we only need to merge parts of the tree that differs from the
tree that was previously checked out in the working copy. As another example,
when listing paths with conflicts, we only need to traverse parts of the tree
that cannot be trivially resolved; if only one side modified `lib/`, then we
don't need to look for conflicts in that sub-tree.

When merging trees, if we can't resolve a sub-tree conflict trivially by looking
at just the tree id, we recurse into the sub-tree. Similarly, if we can't
resolve a file conflict trivially by looking at just the id, we recursive into
the hunks within the file.

See [here](https://www.jj-vcs.dev/latest/git-compatibility/index.html#format-mapping-details) for how conflicts are
stored when using the Git commit backend.

## Conflict simplification[¶](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#conflict-simplification "Permanent link")

Remember that a 3-way merge can be written `A+C-B`. If one of those states is
itself a conflict, then we simply insert the conflict expression there. Then we
simplify by removing canceling terms. These two steps are implemented in
`Merge::flatten()` and `Merge::simplify()` in [`merge.rs`](https://github.com/jj-vcs/jj/blob/main/lib/src/merge.rs).

For example, let's say commit B is based on A and is rebased to C, where it
results in conflicts (`C+(B-A)`), which the user leaves unresolved. If the
commit is then rebased to D, the result will be `D+((C+(B-A))-C)`. That expression
can be simplified to `D+(B-A)`, which is a regular 3-way merge between D and B
with A as base (no trace of C). This is what lets the user keep old commits
rebased to head without resolving conflicts and still not get messy recursive
conflicts.

As another example, let's go through what happens when you back out a conflicted
commit. Let's say we have the usual `E = C+(B-A)` conflict on top of
non-conflict state `C`. We then revert that change. Reverting a change means
applying its reverse diff `-(E-C)`, so the result is `E+(C-E) =
(C+(B-A))+(C-(C+(B-A)))`, which we can simplify to just `C` (i.e. no conflict).

## Same-change rule[¶](https://www.jj-vcs.dev/latest/technical/conflicts/index.html#same-change-rule "Permanent link")

When all sides of a conflict make the same change, [we automatically consider it
resolved to that value](https://github.com/jj-vcs/jj/blob/53272510bf879086d83bb5eea1406f75ba31f138/lib/src/merge.rs#L85-L99) by default. We call this "the same-change
rule". This behavior matches what Git and Mercurial do. Darcs, on the other
hand, considers it a conflict. The automatic conflict resolution we do is lossy
in terms of conflict algebra; it means that rebasing a commit onto a commit that
has the same changes (or a subset thereof) and then rebasing it back will lose
changes (for a real-life example see [bug #6369](https://github.com/jj-vcs/jj/issues/6369)). We do it because it is more
user-friendly in the vast majority of cases.
