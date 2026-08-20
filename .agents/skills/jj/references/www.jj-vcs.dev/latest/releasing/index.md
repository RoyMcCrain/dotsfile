---
title: "Releasing - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/releasing/index"
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
  + Releasing

    [Releasing](https://www.jj-vcs.dev/latest/releasing/index.html)

    Table of contents
    - [Update changelog and Cargo versions](https://www.jj-vcs.dev/latest/releasing/index.html#update-changelog-and-cargo-versions)
    - [Create a tag and a GitHub release](https://www.jj-vcs.dev/latest/releasing/index.html#create-a-tag-and-a-github-release)
    - [Publish the crates to crates.io](https://www.jj-vcs.dev/latest/releasing/index.html#publish-the-crates-to-cratesio)
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

* [Update changelog and Cargo versions](https://www.jj-vcs.dev/latest/releasing/index.html#update-changelog-and-cargo-versions)
* [Create a tag and a GitHub release](https://www.jj-vcs.dev/latest/releasing/index.html#create-a-tag-and-a-github-release)
* [Publish the crates to crates.io](https://www.jj-vcs.dev/latest/releasing/index.html#publish-the-crates-to-cratesio)

# How to do a release[¶](https://www.jj-vcs.dev/latest/releasing/index.html#how-to-do-a-release "Permanent link")

## Update changelog and Cargo versions[¶](https://www.jj-vcs.dev/latest/releasing/index.html#update-changelog-and-cargo-versions "Permanent link")

Send a PR similar to <https://github.com/jj-vcs/jj/pull/7954>. Feel free to
copy-edit the changelog in order to:

* Populate "Release highlights" if relevant
* Put more important items first so the reader doesn't miss them
* Make items consistent when it comes to language and formatting
* Catch any misplaced changelog items by looking at the CHANGELOG diff.

To get the CHANGELOG diff, you can run

```
jj log -r 'heads(tags())'  # Check that this shows the previous version
jj diff --from 'heads(tags())' --to main CHANGELOG.md
```

Make sure to add a corresponding reference link at the bottom of the
CHANGELOG for the new version's tag. It should be the github url comparing
the previous version tag with the new version tag
(e.g. `https://github.com/jj-vcs/jj/compare/v0.32.0...v0.33.0`).

Producing the list of contributors is a bit annoying. The current suggestion is
to run something like this:

```
root=$(jj log --no-graph -r 'heads(tags(glob:"v*.*.*") & ::trunk())' -T commit_id)
filter='
   map(.commits[] | select(.author.login | endswith("[bot]") | not))
   | unique_by(.author.login)
   | map("* \(.commit.author.name) (@\(.author.login))")
   | .[]
'
gh api "/repos/jj-vcs/jj/compare/$root...main" --paginate | jq -sr "$filter" | sort -f
```

<https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#compare-two-commits>

Alternatively, the list can be produced locally:

```
jj log --no-graph -r 'heads(tags())..main' -T '"* " ++ author ++ "\n"' | sort -fu
```

Then try to find the right GitHub username for each person and copy their name
and username from the GitHub page for the person
(e.g. <https://github.com/martinvonz>).

Get the PR through review and get it merged as usual.

## Create a tag and a GitHub release[¶](https://www.jj-vcs.dev/latest/releasing/index.html#create-a-tag-and-a-github-release "Permanent link")

1. Go to <https://github.com/jj-vcs/jj/releases> and click "Draft a new release"
2. Click "Choose a tag" and enter "v0.\<number>.0" (e.g. "v0.26.0") to create a
   new tag
3. Click "Target", then "Recent commits", and select the commit from your merged
   PR
4. Use the name (e.g. "v0.26.0") as "Release title". Paste the changelog entries
   into the message body
5. Check "Create a discussion for this release"
6. Click "Publish release"

## Publish the crates to crates.io[¶](https://www.jj-vcs.dev/latest/releasing/index.html#publish-the-crates-to-cratesio "Permanent link")

Go to a terminal and create a new clone of the repo [1](https://www.jj-vcs.dev/latest/releasing/index.html#fn:1):

```
cd $(mktemp -d)
jj git clone https://github.com/jj-vcs/jj
cd jj
jj new v0.<number>.0
```

Publish each crate:

```
(cd lib/proc-macros && cargo publish)
(cd lib && cargo publish)
(cd cli && cargo publish)
```

---

1. We recommend publishing from a new clone because `cargo publish` will
   archive ignored files if they match the patterns in `[include]`
   ([example](https://github.com/jj-vcs/jj/blob/b95628c398c6c3d11f41bdf53d0aef11f92ee96d/lib/Cargo.toml#L15-L22)),
   so it's a security risk to run it an existing clone where you may have
   left sensitive content in an ignored file. [↩](https://www.jj-vcs.dev/latest/releasing/index.html#fnref:1 "Jump back to footnote 1 in the text")
