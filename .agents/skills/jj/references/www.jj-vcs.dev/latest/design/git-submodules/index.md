---
title: "git-submodules - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/design/git-submodules/index"
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
  + git-submodules

    [git-submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html)

    Table of contents
    - [Objective](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#objective)

      * [Non-goals](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#non-goals)
    - [Background](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#background)

      * [Intro to Git Submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#intro-to-git-submodules)
    - [Roadmap](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#roadmap)

      * [Phase 1: Readonly submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-1-readonly-submodules)

        + [Outcomes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#outcomes)
      * [Phase 2: Snapshotting new changes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-2-snapshotting-new-changes)

        + [Outcomes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#outcomes_1)
      * [Phase 3: Merging/rebasing/conflicts](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-3-mergingrebasingconflicts)

        + [Outcomes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#outcomes_2)
      * [Phase ?: An ideal world](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-an-ideal-world)
    - [Design](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#design)

      * [Guiding principles](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#guiding-principles)
      * [Storing submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#storing-submodules)
      * [Snapshotting new submodule changes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#snapshotting-new-submodule-changes)
      * [Merging/rebasing with submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#mergingrebasing-with-submodules)
  + [git-submodule-storage](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html)
  + [JJ run](https://www.jj-vcs.dev/latest/design/run/index.html)
  + [Sparse patterns v2](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html)
  + [Tracking branches](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html)
  + [Copy tracking and tracing](https://www.jj-vcs.dev/latest/design/copy-tracking/index.html)
  + [Secure config](https://www.jj-vcs.dev/latest/design/secure-config/index.html)
* [Development roadmap](https://www.jj-vcs.dev/latest/roadmap/index.html)
* [Changelog](https://www.jj-vcs.dev/latest/changelog/index.html)

Table of contents

* [Objective](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#objective)

  + [Non-goals](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#non-goals)
* [Background](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#background)

  + [Intro to Git Submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#intro-to-git-submodules)
* [Roadmap](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#roadmap)

  + [Phase 1: Readonly submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-1-readonly-submodules)

    - [Outcomes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#outcomes)
  + [Phase 2: Snapshotting new changes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-2-snapshotting-new-changes)

    - [Outcomes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#outcomes_1)
  + [Phase 3: Merging/rebasing/conflicts](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-3-mergingrebasingconflicts)

    - [Outcomes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#outcomes_2)
  + [Phase ?: An ideal world](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-an-ideal-world)
* [Design](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#design)

  + [Guiding principles](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#guiding-principles)
  + [Storing submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#storing-submodules)
  + [Snapshotting new submodule changes](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#snapshotting-new-submodule-changes)
  + [Merging/rebasing with submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#mergingrebasing-with-submodules)

# Git submodules[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#git-submodules "Permanent link")

This is an aspirational document that describes how jj *will* support Git
submodules. Readers are assumed to have some familiarity with Git and Git
submodules.

This document is a work in progress; submodules are a big feature, and relevant
details will be filled in incrementally.

## Objective[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#objective "Permanent link")

This proposal aims to replicate the workflows users are used to with Git
submodules, e.g.:

* Cloning submodules
* Making new submodule commits and updating the superproject
* Fetching and pushing updates to the submodule's remote
* Viewing submodule history

When it is convenient, this proposal will also aim to make submodules easier to
use than Git's implementation.

### Non-goals[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#non-goals "Permanent link")

* Non-Git 'submodules' (e.g. native jj submodules, other VCSes)
* Non-Git backends (e.g. Google internal backend)
* Changing how Git submodules are implemented in Git

## Background[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#background "Permanent link")

We mainly want to support Git submodules for feature parity, since Git
submodules are a standard feature in Git and are popular enough that we have
received user requests for them. Secondarily (and distantly so), Git submodules
are notoriously difficult to use, so there is an opportunity to improve the UX
over Git's implementation.

### Intro to Git Submodules[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#intro-to-git-submodules "Permanent link")

[Git submodules](https://git-scm.com/docs/gitsubmodules) are a feature of Git
that allow a repository (submodule) to be embedded inside another repository
(the superproject). Notably, a submodule is a full repository, complete with its
own index, object store and ref store. It can be interacted with like any other
repository, regardless of the superproject.

In a superproject commit, submodule information is captured in two places:

* A `gitlink` entry in the commit's tree, where the value of the `gitlink` entry
  is the submodule commit id. This tells Git what to populate in the working
  tree.
* A top level `.gitmodules` file. This file is in Git's config syntax and
  entries take the form `submodule.<submodule-name>.*`. These include many
  settings about the submodules, but most importantly:

  + `submodule<submodule-name>.path` contains the path from the root of the tree
    to the `gitlink` being described.
  + `submodule<submodule-name>.url` contains the url to clone the submodule
    from.

In the working tree, Git notices the presence of a submodule by the `.git` entry
(signifying the root of a Git repository working tree). This is either the
submodule's actual Git directory (an "old-form" submodule), or a `.git` file
pointing to `<superproject-git-directory>/modules/<submodule-name>`. The latter
is sometimes called the "absorbed form", and is Git's preferred mode of
operation.

## Roadmap[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#roadmap "Permanent link")

Git submodules should be implemented in an order that supports an increasing set
of workflows, with the goal of getting feedback early and often. When support is
incomplete, jj should not crash, but instead provide fallback behavior and warn
the user where needed.

The goal is to land good support for pure Jujutsu workspaces, while colocated
workspaces will be supported when convenient.

This section should be treated as a set of guidelines, not a strict order of
work.

### Phase 1: Readonly submodules[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-1-readonly-submodules "Permanent link")

This includes work that inspects submodule contents but does not create new
objects in the submodule. This requires a way to store submodules in a jj
repository that supports readonly operations.

#### Outcomes[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#outcomes "Permanent link")

* Submodules can be cloned anew
* New submodule commits can be fetched
* Submodule history and branches can be viewed
* Submodule contents are populated in the working copy
* Superproject gitlink can be updated to an existing submodule commit
* Conflicts in the superproject gitlink can be resolved to an existing submodule
  commit

### Phase 2: Snapshotting new changes[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-2-snapshotting-new-changes "Permanent link")

This allows a user to write new contents to a submodule and its remote.

#### Outcomes[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#outcomes_1 "Permanent link")

* Changes in the working copy can be recorded in a submodule commit
* Submodule branches can be modified
* Submodules and their branches can be pushed to their remote

### Phase 3: Merging/rebasing/conflicts[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-3-mergingrebasingconflicts "Permanent link")

This allows merging and rebasing of superproject commits in a content-aware way
(in contrast to Git, where only the gitlink commit ids are compared), as well as
workflows that make resolving conflicts easy and sensible.

This can be done in tandem with Phase 2, but will likely require a significant
amount of design work on its own.

#### Outcomes[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#outcomes_2 "Permanent link")

* Merged/rebased submodules result in merged/rebased working copy content
* Merged/rebased working copy content can be committed, possibly by creating
  sensible merged/rebased submodule commits
* Merge/rebase between submodule and non-submodule gives a sensible result
* Merge/rebase between submodule A and submodule B gives a sensible result

### Phase ?: An ideal world[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#phase-an-ideal-world "Permanent link")

I.e. outcomes we would like to see if there were no constraints whatsoever.

* Rewriting submodule commits rewrites descendants correctly and updates
  superproject gitlinks.
* Submodule conflicts automatically resolve to the 'correct' submodule commits,
  e.g. a merge between superproject commits creating a merge of the submodule
  commits.
* Nested submodules are as easy to work with as non-nested submodules.
* The operation log captures changes in the submodule.

## Design[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#design "Permanent link")

### Guiding principles[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#guiding-principles "Permanent link")

TODO

### Storing submodules[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#storing-submodules "Permanent link")

Possible approaches under discussion. See
[./git-submodule-storage.md](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html).

### Snapshotting new submodule changes[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#snapshotting-new-submodule-changes "Permanent link")

TODO

### Merging/rebasing with submodules[¶](https://www.jj-vcs.dev/latest/design/git-submodules/index.html#mergingrebasing-with-submodules "Permanent link")

TODO
