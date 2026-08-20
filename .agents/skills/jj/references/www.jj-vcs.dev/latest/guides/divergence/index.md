---
title: "Divergent changes - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/guides/divergence/index"
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
  + Divergent changes

    [Divergent changes](https://www.jj-vcs.dev/latest/guides/divergence/index.html)

    Table of contents
    - [What are divergent changes?](https://www.jj-vcs.dev/latest/guides/divergence/index.html#what-are-divergent-changes)
    - [How do I resolve divergent changes?](https://www.jj-vcs.dev/latest/guides/divergence/index.html#how-do-i-resolve-divergent-changes)

      * [Strategy 1: Abandon one of the commits](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-1-abandon-one-of-the-commits)
      * [Strategy 2: Generate a new change ID](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-2-generate-a-new-change-id)
      * [Strategy 3: Squash the commits together](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-3-squash-the-commits-together)
      * [Strategy 4: Ignore the divergence](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-4-ignore-the-divergence)
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

* [What are divergent changes?](https://www.jj-vcs.dev/latest/guides/divergence/index.html#what-are-divergent-changes)
* [How do I resolve divergent changes?](https://www.jj-vcs.dev/latest/guides/divergence/index.html#how-do-i-resolve-divergent-changes)

  + [Strategy 1: Abandon one of the commits](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-1-abandon-one-of-the-commits)
  + [Strategy 2: Generate a new change ID](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-2-generate-a-new-change-id)
  + [Strategy 3: Squash the commits together](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-3-squash-the-commits-together)
  + [Strategy 4: Ignore the divergence](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-4-ignore-the-divergence)

# Handling divergent changes[¶](https://www.jj-vcs.dev/latest/guides/divergence/index.html#handling-divergent-changes "Permanent link")

## What are divergent changes?[¶](https://www.jj-vcs.dev/latest/guides/divergence/index.html#what-are-divergent-changes "Permanent link")

A [divergent change](https://www.jj-vcs.dev/latest/glossary/index.html#divergent-change) occurs when multiple [visible commits](https://www.jj-vcs.dev/latest/glossary/index.html#visible-commits) have the same change
ID. These changes are displayed with a [change offset](https://www.jj-vcs.dev/latest/glossary/index.html#change-offset) after their change ID and
a label of "divergent":

```
$ jj log
@  mzvwutvl/0 test.user@example.com 2001-02-03 08:05:12 29d07a2d (divergent)
│  a divergent change
```

Normally, when commits are rewritten, the original version (the "predecessor")
becomes hidden and the new commit (the "successor") is visible. Thus, only one
commit with a given change ID is visible at a time.

But, a hidden commit can become visible again. This can happen if:

* A visible descendant is added locally. For example, `jj new REV` will make
  `REV` visible even if it was hidden before.
* A visible descendant is fetched from a remote. If the hidden commit was pushed
  to a remote, others may base new commits off of them. When their new commits are
  fetched, their visibility makes the hidden commit visible again.
* It is made the working copy. `jj edit REV` will make `REV` and all its
  ancestors visible if it wasn't already.
* Some other operations make hidden commits visible. For example, adding a
  bookmark to a hidden commit makes it visible with the assumption that you are
  now working with that commit again.

Divergent changes also occur if two different users or processes amend the same
change, creating two visible successors. This can happen when:

* Another author modifies commits in a branch that you have also modified
  locally.
* You perform operations on the same change from different workspaces of the
  same repository.
* Two programs modify the repository at the same time. For example, you run
  `jj describe` and, while writing your commit description, an IDE integration
  fetches and rebases the branch you're working on.

## How do I resolve divergent changes?[¶](https://www.jj-vcs.dev/latest/guides/divergence/index.html#how-do-i-resolve-divergent-changes "Permanent link")

When you encounter divergent changes, you have several strategies to choose
from. The best approach depends on whether you want to keep the content from one
commit, both commits, or merge them together.

Note that revsets must refer to the divergent commit either using its commit ID
or using its change ID with a [change offset](https://www.jj-vcs.dev/latest/glossary/index.html#change-offset) like `/0` or `/1` as shown in the
log, since the change ID is ambiguous by itself.

### Strategy 1: Abandon one of the commits[¶](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-1-abandon-one-of-the-commits "Permanent link")

If one of the divergent commits is clearly obsolete or incorrect, simply abandon
it:

```
# Abandon the unwanted commit using its commit ID (or change ID with offset)
jj abandon <unwanted-commit-id>

# You can abandon several at once with:
# jj abandon abc def 123
# jj abandon abc::
```

This is the simplest solution when you know which version to keep.

### Strategy 2: Generate a new change ID[¶](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-2-generate-a-new-change-id "Permanent link")

If you want to keep both versions as separate changes with different change IDs,
you can generate a new change ID for one of the commits:

```
jj metaedit --update-change-id <commit-id>
```

This preserves both versions of the content while resolving the divergence.

### Strategy 3: Squash the commits together[¶](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-3-squash-the-commits-together "Permanent link")

When you want to combine the content from both divergent commits:

```
# Squash one commit into the other
jj squash --from <source-commit-id> --into <target-commit-id>
```

This combines the changes from both commits into a single commit. The source
commit will be abandoned.

### Strategy 4: Ignore the divergence[¶](https://www.jj-vcs.dev/latest/guides/divergence/index.html#strategy-4-ignore-the-divergence "Permanent link")

Divergence isn't an error. If the divergence doesn't cause immediate problems,
you can leave it as-is. If both commits are part of immutable history, this may
be your only option.

However, it can be inconvenient since you cannot refer to divergent changes
unambiguously using their change ID alone.
