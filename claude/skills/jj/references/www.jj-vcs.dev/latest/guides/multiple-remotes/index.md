---
title: "Multiple remotes - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/guides/multiple-remotes/index"
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
  + Multiple remotes

    [Multiple remotes](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html)

    Table of contents
    - [Nomenclature](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#nomenclature)
    - [Contributing upstream with a GitHub-style fork](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#contributing-upstream-with-a-github-style-fork)
    - [Maintaining an independent repository that integrates changes from upstream](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#maintaining-an-independent-repository-that-integrates-changes-from-upstream)
    - [Other workflows](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#other-workflows)
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

* [Nomenclature](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#nomenclature)
* [Contributing upstream with a GitHub-style fork](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#contributing-upstream-with-a-github-style-fork)
* [Maintaining an independent repository that integrates changes from upstream](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#maintaining-an-independent-repository-that-integrates-changes-from-upstream)
* [Other workflows](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#other-workflows)

# Multiple remotes[¶](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#multiple-remotes "Permanent link")

When using multiple [remote repositories](https://www.jj-vcs.dev/latest/glossary/index.html#remote), how you configure them in Jujutsu
depends on your workflow and the role each remote plays.

The setup varies based on whether you are contributing to an upstream project,
or integrating changes from another repository.

## Nomenclature[¶](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#nomenclature "Permanent link")

A remote named `origin` is one you have write-access to and is usually where you
push changes.

A remote named `upstream` is the more well-known repository. You may not be able
to push to this repository.

The trunk in each repository is assumed to be `main`, so the remote bookmarks
are `main@origin` and `main@upstream`.

## Contributing upstream with a GitHub-style fork[¶](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#contributing-upstream-with-a-github-style-fork "Permanent link")

This is a GitHub-style fork used to contribute to the upstream repository.
`upstream` is the canonical upstream remote, and `origin` is where you push
contributions, most likely so you can open pull requests.

Actions you might take:

* Fetch from `upstream` to get the latest changes.
* Push `main` to `origin` to keep it up-to-date.
* Push `my-feature` to `origin`, then open a pull request to `upstream`.

To support this scenario, you should:

* Track `main@upstream` so your local `main` branch is updated whenever you
  fetch from `upstream`.
* Track `main@origin` so when you `jj git push`, your fork's `main` branch is
  updated.
* Set `main@upstream` as the `trunk()` revset alias so it is immutable.

```
# Fetch from both remotes by default
$ jj config set --repo git.fetch '["upstream", "origin"]'

# Push only to the fork by default
$ jj config set --repo git.push origin

# Track both remote bookmarks
$ jj bookmark track main

# The upstream repository defines the trunk
$ jj config set --repo 'revset-aliases."trunk()"' main@upstream
```

## Maintaining an independent repository that integrates changes from upstream[¶](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#maintaining-an-independent-repository-that-integrates-changes-from-upstream "Permanent link")

This is a repository that was originally cloned from upstream, but now contains
changes in its `main` branch that are not upstream and might never be
contributed back.

* `origin` is the repository you are working in.
* `upstream` is the repository you periodically integrate changes from.

Actions you might take:

* Fetch from `origin` to get the latest changes.
* Push bookmarks to `origin`.
* Merge pull requests into `main@origin`.
* Periodically fetch from `main@upstream` and merge, rebase, or duplicate its
  changes into `main@origin`.

To support this scenario, you should:

* Track only `main@origin` so your local `main` branch is updated whenever you
  fetch from `origin`, and so you can push to it if necessary.
* *Do not* track `main@upstream`.
* Set `main@origin` as the `trunk()` revset alias so it is immutable.

```
# Fetch from origin or both remotes by default
$ jj config set --repo git.fetch '["origin"]'
# or: jj config set --repo git.fetch '["upstream", "origin"]'

# Push only to origin by default
$ jj config set --repo git.push origin

# Track only the origin bookmark
$ jj bookmark track main --remote=origin
$ jj bookmark untrack main --remote=upstream

# The origin repository defines the trunk
$ jj config set --repo 'revset-aliases."trunk()"' main@origin
```

## Other workflows[¶](https://www.jj-vcs.dev/latest/guides/multiple-remotes/index.html#other-workflows "Permanent link")

Other workflows may be supported. Some general guidance for this:

* Set `trunk()` to be the remote bookmark you usually rebase upon. If you always
  rebase against upstream, set it to `main@upstream`.
* Tracking a remote bookmark `main@origin` means it and `main` represent the
  same branch. When one moves, the other should move with it. If you want them to
  *automatically* move together, you should track the remote bookmark. If not, do
  not track it.

If you have a workflow that is not well-supported, discussion is welcome in
[Discord](https://discord.gg/dkmfj3aGQN). There is also an [open discussion](https://github.com/jj-vcs/jj/issues/7072) for enhancing how bookmark
tracking works.
