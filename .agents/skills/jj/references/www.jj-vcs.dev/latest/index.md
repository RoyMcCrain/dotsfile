---
title: "Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/index"
fetched_at: "2026-02-02T08:21:03.339661+00:00"
---



Jujutsu docs

[jj-vcs/jj](https://github.com/jj-vcs/jj "Go to repository")

* Home

  [Home](https://www.jj-vcs.dev/latest/index.html)

  Table of contents
  + [Welcome to jj's documentation website!](https://www.jj-vcs.dev/latest/index.html#welcome-to-jjs-documentation-website)
  + [Some useful links](https://www.jj-vcs.dev/latest/index.html#some-useful-links)
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
  + [git-submodule-storage](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html)
  + [JJ run](https://www.jj-vcs.dev/latest/design/run/index.html)
  + [Sparse patterns v2](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html)
  + [Tracking branches](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html)
  + [Copy tracking and tracing](https://www.jj-vcs.dev/latest/design/copy-tracking/index.html)
  + [Secure config](https://www.jj-vcs.dev/latest/design/secure-config/index.html)
* [Development roadmap](https://www.jj-vcs.dev/latest/roadmap/index.html)
* [Changelog](https://www.jj-vcs.dev/latest/changelog/index.html)

Table of contents

* [Welcome to jj's documentation website!](https://www.jj-vcs.dev/latest/index.html#welcome-to-jjs-documentation-website)
* [Some useful links](https://www.jj-vcs.dev/latest/index.html#some-useful-links)

# Jujutsu—a version control system[¶](https://www.jj-vcs.dev/latest/index.html#jujutsua-version-control-system "Permanent link")

![](https://www.jj-vcs.dev/latest/images/jj-logo.svg "jj logo")

## Welcome to `jj`'s documentation website![¶](https://www.jj-vcs.dev/latest/index.html#welcome-to-jjs-documentation-website "Permanent link")

The complete list of the available documentation pages is located in
the sidebar on the left of the page. The sidebar may be hidden; if so,
you can open it either by widening your browser window or by clicking
on the hamburger menu that appears in this situation.

Additional help is available using the `jj help` command if you have
`jj` installed.

You may want to jump to:

* Documentation for the [latest released version of `jj`](https://docs.jj-vcs.dev/latest).
* Documentation for the [unreleased version of `jj`](https://docs.jj-vcs.dev/prerelease). This version of the docs corresponds to the `main` branch of the `jj` repo.

## Some useful links[¶](https://www.jj-vcs.dev/latest/index.html#some-useful-links "Permanent link")

* [GitHub repo for `jj`](https://github.com/jj-vcs/jj)
* Overview of `jj` in the repo's [README](https://github.com/jj-vcs/jj?tab=readme-ov-file#readme)
* [Installation and setup](https://www.jj-vcs.dev/latest/install-and-setup/index.html)
* [Tutorial and bird's eye view](https://www.jj-vcs.dev/latest/tutorial/index.html)
* [Working with Gerrit](https://www.jj-vcs.dev/latest/gerrit/index.html)
* [Working with GitHub](https://www.jj-vcs.dev/latest/github/index.html)
* [Development roadmap](https://www.jj-vcs.dev/latest/roadmap/index.html)
* [Changelog](https://www.jj-vcs.dev/latest/changelog/index.html)
