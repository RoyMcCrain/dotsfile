---
title: "Core tenets - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/core_tenets/index"
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
  + Core tenets

    [Core tenets](https://www.jj-vcs.dev/latest/core_tenets/index.html)

    Table of contents
    - [Jujutsu's Core Tenets](https://www.jj-vcs.dev/latest/core_tenets/index.html#jujutsus-core-tenets)
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

* [Jujutsu's Core Tenets](https://www.jj-vcs.dev/latest/core_tenets/index.html#jujutsus-core-tenets)

# Core tenets

## Jujutsu's Core Tenets[¶](https://www.jj-vcs.dev/latest/core_tenets/index.html#jujutsus-core-tenets "Permanent link")

Jujutsu's core tenets are:

* Separation of logic and UI: It should be easy to create new UIs (CLIs, GUIs,
  TUIs, servers) without having to duplicate logic.
* Easy-to-use APIs: It should be easy to create new commands. For example,
  each command should not have to worry about concurrency, working-copy state,
  and rebasing descendants of rewritten commits.
* User-friendliness: Making the working copy a commit is simpler. This is
  how the project started.
* The repo is the source of truth: Most commands should operate on the commit
  graph. The working copy is just one way of editing commits.
* Pluggable storage: Must be easy to integrate with different commit storage,
  virtual file systems and more.
* Git-interoperability: Git is everywhere. We need to have good
  interoperability to be adopted.
* All operations must be able to scale to Google-scale repos (lots of commits,
  lots of files): Laziness is important, must avoid accessing data
  unnecessarily.
* Having as few states as possible.
* Make it incredibly hard to lose work in your repo.
* Concurrent modifications to the repo should be safe.
* Allow concurrent edits on any commit, pending or finished.
* Make a "stacked diffs" workflow as easy as possible.
