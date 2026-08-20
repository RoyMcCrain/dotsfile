---
title: "Style guide - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/style_guide/index"
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
  + Style guide

    [Style guide](https://www.jj-vcs.dev/latest/style_guide/index.html)

    Table of contents
    - [Panics](https://www.jj-vcs.dev/latest/style_guide/index.html#panics)
    - [Markdown](https://www.jj-vcs.dev/latest/style_guide/index.html#markdown)
    - [Prefer lower-level tests to end-to-end tests](https://www.jj-vcs.dev/latest/style_guide/index.html#prefer-lower-level-tests-to-end-to-end-tests)
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

* [Panics](https://www.jj-vcs.dev/latest/style_guide/index.html#panics)
* [Markdown](https://www.jj-vcs.dev/latest/style_guide/index.html#markdown)
* [Prefer lower-level tests to end-to-end tests](https://www.jj-vcs.dev/latest/style_guide/index.html#prefer-lower-level-tests-to-end-to-end-tests)

# Style guide[¶](https://www.jj-vcs.dev/latest/style_guide/index.html#style-guide "Permanent link")

## Panics[¶](https://www.jj-vcs.dev/latest/style_guide/index.html#panics "Permanent link")

Panics are not allowed, especially in code that may run on a server. Calling
`.unwrap()` is okay if it's guaranteed to be safe by previous checks or
documented invariants. For example, if a function is documented as requiring
a non-empty slice as input, it's fine to call `slice[0]` and panic.

## Markdown[¶](https://www.jj-vcs.dev/latest/style_guide/index.html#markdown "Permanent link")

Try to wrap at 80 columns. We don't have a formatter yet.

## Prefer lower-level tests to end-to-end tests[¶](https://www.jj-vcs.dev/latest/style_guide/index.html#prefer-lower-level-tests-to-end-to-end-tests "Permanent link")

When possible, prefer lower-level tests that don't use the `jj` binary.
End-to-end tests are much slower than similar tests that create a repo using
`jj-lib` (roughly 100x slower). It's also often easier to test edge cases in
lower-level tests.

It can still be useful to add a test case or two to check that the lower-level
functionality is correctly hooked up in the CLI. For example, the end-to-end
tests for `jj log` don't need to test that all kinds of revsets are evaluated
correctly (we have tests in `jj-lib` for that), but they should check that the
`-r` flag is respected.

Use end-to-end tests for testing the CLI commands themselves.
