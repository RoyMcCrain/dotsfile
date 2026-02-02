---
title: "git-submodule-storage - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/design/git-submodule-storage/index"
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
  + git-submodule-storage

    [git-submodule-storage](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html)

    Table of contents
    - [Objective](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#objective)
    - [Use cases to consider](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#use-cases-to-consider)

      * [Fetching submodule commits](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#fetching-submodule-commits)
      * ["jj op restore" and operation log format](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#jj-op-restore-and-operation-log-format)
      * [Nested submodules](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#nested-submodules)
      * [Supporting future extensions](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#supporting-future-extensions)
    - [Proposed design](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#proposed-design)

      * [Fetching submodule commits](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#fetching-submodule-commits_1)
      * ["jj op restore" and operation log format](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#jj-op-restore-and-operation-log-format_1)
      * [Nested submodules](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#nested-submodules_1)
      * [Extending to colocated Git workspaces](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#extending-to-colocated-git-workspaces)
    - [Alternatives considered](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#alternatives-considered)

      * [Git repos in the main Git backend](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#git-repos-in-the-main-git-backend)
      * [Store Git submodules as alternate Git backends](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#store-git-submodules-as-alternate-git-backends)
  + [JJ run](https://www.jj-vcs.dev/latest/design/run/index.html)
  + [Sparse patterns v2](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html)
  + [Tracking branches](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html)
  + [Copy tracking and tracing](https://www.jj-vcs.dev/latest/design/copy-tracking/index.html)
  + [Secure config](https://www.jj-vcs.dev/latest/design/secure-config/index.html)
* [Development roadmap](https://www.jj-vcs.dev/latest/roadmap/index.html)
* [Changelog](https://www.jj-vcs.dev/latest/changelog/index.html)

Table of contents

* [Objective](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#objective)
* [Use cases to consider](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#use-cases-to-consider)

  + [Fetching submodule commits](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#fetching-submodule-commits)
  + ["jj op restore" and operation log format](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#jj-op-restore-and-operation-log-format)
  + [Nested submodules](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#nested-submodules)
  + [Supporting future extensions](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#supporting-future-extensions)
* [Proposed design](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#proposed-design)

  + [Fetching submodule commits](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#fetching-submodule-commits_1)
  + ["jj op restore" and operation log format](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#jj-op-restore-and-operation-log-format_1)
  + [Nested submodules](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#nested-submodules_1)
  + [Extending to colocated Git workspaces](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#extending-to-colocated-git-workspaces)
* [Alternatives considered](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#alternatives-considered)

  + [Git repos in the main Git backend](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#git-repos-in-the-main-git-backend)
  + [Store Git submodules as alternate Git backends](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#store-git-submodules-as-alternate-git-backends)

# Git submodule storage[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#git-submodule-storage "Permanent link")

## Objective[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#objective "Permanent link")

Decide what approach(es) to Git submodule storage we should pursue.
The decision will be recorded in [./git-submodules.md](https://www.jj-vcs.dev/latest/design/git-submodules/index.html).

## Use cases to consider[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#use-cases-to-consider "Permanent link")

The submodule storage format should support the workflows specified in the
[submodules roadmap](https://www.jj-vcs.dev/latest/design/git-submodules/index.html). It should be obvious how "Phase 1"
requirements will be supported, and we should have an idea of how "Phases 2,3,X"
might be supported.

Notable use cases and workflows are noted below.

### Fetching submodule commits[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#fetching-submodule-commits "Permanent link")

Git's protocol is designed for communicating between copies of the same
repository. Notably, a Git fetch calculates the list of required objects by
performing reachability checks between the refs on the local and the remote
side. We should expect that this will only work well if the submodule repository
is stored as a local Git repository.

Rolling our own Git fetch is too complex to be worth the effort.

### "jj op restore" and operation log format[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#jj-op-restore-and-operation-log-format "Permanent link")

We want `jj op restore` to restore to an "expected" state in the submodule.
There is a potential distinction between running `jj op restore` in the
superproject vs in the submodule, and the expected behavior may be different in
each case, e.g. in the superproject, it might be enough to restore the submodule
working copy, but in the submodule, refs also need to be restored.

Currently, the operation log only references objects and refs in the
superproject, so it is likely that proposed approaches will need to extend this
format. It is also worth considering that submodules may be added, updated or
removed in superproject commits, thus the list of submodules is likely to change
over the repository's lifetime.

### Nested submodules[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#nested-submodules "Permanent link")

Git submodules may contain submodules themselves, so our chosen storage schemes
should support that.

We should consider limiting the recursion depth to avoid nasty edge cases (e.g.
cyclical submodules.) that might surprise users.

### Supporting future extensions[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#supporting-future-extensions "Permanent link")

There are certain extensions we may want to make in the future, but we don't
have a timeline for them today. Proposed approaches should take these
extensions into account (e.g. the approach should be theoretically extensible),
but a full proposal for implementing them is not necessary.

These extensions are:

* Non-git subrepos
* Colocated Git workspace
* The superproject using a non-git backend

## Proposed design[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#proposed-design "Permanent link")

Git submodules will be stored as full jj repos. In the code, jj commands will
only interact with the submodule's repo as an entire unit, e.g. it cannot query
the submodule's commit backend directly. A well-abstracted submodule will extend
well to non-git backends and non-git subrepos.

The main challenge with this approach is that the submodule repo can be in a
state that is internally valid (when considering only the submodule's repo), but
invalid when considering the superproject-submodule system. This will be managed
by requiring all submodule interactions go through the superproject so that
superproject-submodule coordination can occur. For example, jj will not allow
the user to work on the submodule's repo without going through the superproject
(unlike Git).

The notable workflows could be addressed like so:

### Fetching submodule commits[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#fetching-submodule-commits_1 "Permanent link")

The submodule would fetch using the equivalent of `jj git fetch`. It remains to
be decided how a "recursive" fetch should work, especially if a newly fetched
superproject commit references an unfetched submodule commit. A reasonable
approximation would be to fetch all branches in the submodule, and then, if the
submodule commit is still missing, gracefully handle it.

### "jj op restore" and operation log format[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#jj-op-restore-and-operation-log-format_1 "Permanent link")

As full repos, each submodule will have its own operation log. We will continue
to use the existing operation log format, where each operation log tracks their
own repo's commits. As commands are run in the superproject, corresponding
commands will be run in the submodule as necessary, e.g. checking out a
superproject commit will cause a submodule commit to also be checked out.

Since there is no association between a superproject operation and a submodule
operation, `jj op restore` in the superproject will not restore the submodule to
a previous operation. Instead, the appropriate submodule operation(s) will be
created. This is sufficient to preserve the superproject-submodule relationship;
it precludes "recursive" restore (e.g. restoring branches in the superproject
and submodules) but it seems unlikely that we will need such a thing.

### Nested submodules[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#nested-submodules_1 "Permanent link")

Since submodules are full repos, they can contain submodules themselves. Nesting
is unlikely to complicate any of the core features, since the top-level
superproject/submodule relationship is almost identical to the submodule/nested
submodule relationship.

### Extending to colocated Git workspaces[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#extending-to-colocated-git-workspaces "Permanent link")

Git expects submodules to be in `.git/modules`, so it will not understand this
storage format. To support colocated Git workspaces, we will have to change Git
to allow a submodule's gitdir to be in an alternate location (e.g. we could add
a new `submodule.<name>.gitdir` config option). This is a simple change, so it
should be feasible.

## Alternatives considered[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#alternatives-considered "Permanent link")

### Git repos in the main Git backend[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#git-repos-in-the-main-git-backend "Permanent link")

Since the Git backend contains a Git repository, an 'obvious' default would be
to store them in the Git superproject the same way Git does, i.e. in
`.git/modules`. Since Git submodules are full repositories that can have
submodules, this storage scheme naturally extends to nested submodules.

Most of the work in storing submodules and querying them would be well-isolated
to the Git backend, which gives us a lot of flexibility to make changes without
affecting the rest of jj. However, the operation log will need a significant
rework since it isn't designed to reference submodules, and handling edge cases
(e.g. a submodule being added/removed, nested submodules) will be tricky.

This is rejected because handling that operation log complexity isn't worth it
when very little of the work extends to non-Git backends.

### Store Git submodules as alternate Git backends[¶](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html#store-git-submodules-as-alternate-git-backends "Permanent link")

Teach jj to use multiple commit backends and store Git submodules as Git
backends. Since submodules are separate from the 'main' backend, a repository
can use whatever backend it wants as its 'main' one, while still having Git
submodules in the 'alternate' Git backends.

This approach extends fairly well to non-Git submodules (which would be stored
in non-Git commit backends). However, this requires significantly reworking the
operation log to account for multiple commit backends. It is also not clear how
nested submodules will be supported since there isn't an obvious way to
represent a nested submodule's relationship to its superproject.
