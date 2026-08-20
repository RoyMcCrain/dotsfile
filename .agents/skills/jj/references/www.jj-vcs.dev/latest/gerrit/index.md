---
title: "Working with Gerrit - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/gerrit/index"
fetched_at: "2026-02-02T08:21:03.339661+00:00"
---



Jujutsu docs

[jj-vcs/jj](https://github.com/jj-vcs/jj "Go to repository")

* [Home](https://www.jj-vcs.dev/latest/index.html)
* Getting started

  Getting started
  + [Installation and setup](https://www.jj-vcs.dev/latest/install-and-setup/index.html)
  + [Tutorial and bird's eye view](https://www.jj-vcs.dev/latest/tutorial/index.html)
  + Working with Gerrit

    [Working with Gerrit](https://www.jj-vcs.dev/latest/gerrit/index.html)

    Table of contents
    - [Set up a Gerrit remote](https://www.jj-vcs.dev/latest/gerrit/index.html#set-up-a-gerrit-remote)
    - [Basic workflow](https://www.jj-vcs.dev/latest/gerrit/index.html#basic-workflow)

      * [Upload a single change](https://www.jj-vcs.dev/latest/gerrit/index.html#upload-a-single-change)
    - [Selecting revisions (revsets)](https://www.jj-vcs.dev/latest/gerrit/index.html#selecting-revisions-revsets)

      * [Preview without pushing](https://www.jj-vcs.dev/latest/gerrit/index.html#preview-without-pushing)
    - [Target branch and remote selection](https://www.jj-vcs.dev/latest/gerrit/index.html#target-branch-and-remote-selection)
    - [Updating changes after review](https://www.jj-vcs.dev/latest/gerrit/index.html#updating-changes-after-review)
    - [Change-Id management](https://www.jj-vcs.dev/latest/gerrit/index.html#change-id-management)
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

* [Set up a Gerrit remote](https://www.jj-vcs.dev/latest/gerrit/index.html#set-up-a-gerrit-remote)
* [Basic workflow](https://www.jj-vcs.dev/latest/gerrit/index.html#basic-workflow)

  + [Upload a single change](https://www.jj-vcs.dev/latest/gerrit/index.html#upload-a-single-change)
* [Selecting revisions (revsets)](https://www.jj-vcs.dev/latest/gerrit/index.html#selecting-revisions-revsets)

  + [Preview without pushing](https://www.jj-vcs.dev/latest/gerrit/index.html#preview-without-pushing)
* [Target branch and remote selection](https://www.jj-vcs.dev/latest/gerrit/index.html#target-branch-and-remote-selection)
* [Updating changes after review](https://www.jj-vcs.dev/latest/gerrit/index.html#updating-changes-after-review)
* [Change-Id management](https://www.jj-vcs.dev/latest/gerrit/index.html#change-id-management)

# Using Jujutsu with Gerrit Code Review[¶](https://www.jj-vcs.dev/latest/gerrit/index.html#using-jujutsu-with-gerrit-code-review "Permanent link")

JJ and Gerrit share the same mental model, which makes Gerrit feel like a
natural collaboration tool for JJ. JJ tracks a "change identity" across
rewrites, and Gerrit’s `Change-Id` tracks the same logical change across patch
sets. JJ and Gerrit's `Change-Id`s aren’t natively compatible yet, but they’re
philosophically aligned. `jj gerrit upload` bridges the gap today by adding a
Gerrit-style `Change-Id` while JJ keeps its own notion of change identity on the
client. In practice, that means small, clean commits that evolve over
time, exactly how Gerrit wants you to work.

This guide assumes a basic understanding of Git, Gerrit, and Jujutsu.

## Set up a Gerrit remote[¶](https://www.jj-vcs.dev/latest/gerrit/index.html#set-up-a-gerrit-remote "Permanent link")

Jujutsu communicates with Gerrit by pushing commits to a Git remote. If you're
starting from an existing Git repository with Gerrit remotes already configured,
you can use `jj git init --colocate` to start using JJ in that repo. Otherwise,
set up your Gerrit remote.

```
# Option 1: Start JJ in an existing Git repo with Gerrit remotes
$ jj git init --colocate

# Option 2: Add a Gerrit remote to a JJ repo
$ jj git remote add gerrit https://review.gerrithub.io/yourname/yourproject

# Option 3: Clone the repo via jj
$ jj git clone https://review.gerrithub.io/your/project
```

If you used option 2 You can configure default values in your repository config
by appending the below to `.jj/repo/config.toml`, like so:

```
[gerrit]
default-remote = "gerrit"       # name of the Git remote to push to
default-remote-branch = "main"  # target branch in Gerrit
```

## Basic workflow[¶](https://www.jj-vcs.dev/latest/gerrit/index.html#basic-workflow "Permanent link")

`jj gerrit upload` takes one or more revsets, and uploads the stack of commits
ending in them to Gerrit. Each JJ change will map to a single Gerrit change
based on the JJ change ID. This should be what you want most of the time, but if
you want to associate a JJ change with a specific change already uploaded to
Gerrit, you can copy the Change-Id footer from Gerrit to the bottom of the
commit description in JJ.

> Note: Gerrit identifies and updates changes by the `Change-Id` trailer. When
> you re-upload a commit with the same `Change-Id`, Gerrit creates a new patch
> set.

### Upload a single change[¶](https://www.jj-vcs.dev/latest/gerrit/index.html#upload-a-single-change "Permanent link")

```
# upload the previous commit (@-) for review to main
$ jj gerrit upload -r @-
```

## Selecting revisions (revsets)[¶](https://www.jj-vcs.dev/latest/gerrit/index.html#selecting-revisions-revsets "Permanent link")

`jj gerrit upload` accepts one or more `-r/--revisions` arguments. Each argument
may expand to multiple commits. Common patterns:

* `-r @-`: the commit previous to the one you're currently working on
* `-r A..B`: commits that are ancestors of B but not of A

See the [revsets](https://www.jj-vcs.dev/latest/revsets/index.html) guide for more information.

### Preview without pushing[¶](https://www.jj-vcs.dev/latest/gerrit/index.html#preview-without-pushing "Permanent link")

Use `--dry-run` to see which commits would be modified and pushed, and where,
without changing anything or contacting the remote.

```
$ jj gerrit upload -r '@-' --remote-branch main --dry-run
```

## Target branch and remote selection[¶](https://www.jj-vcs.dev/latest/gerrit/index.html#target-branch-and-remote-selection "Permanent link")

There are a few way of specifying the target remote for your projects:

* Please run `jj config set --user gerrit.default-remote-branch <branch name>` to set your
  default branch across all repos
* Please run `jj config set --repo gerrit.default-remote-branch <branch name>` to set your
  default branch for this specific repo.
* Use `--remote-branch <branch name>` to override this for one specific occasion.

The remote used to push is determined as follows:

* If you have more than one origin, or the origin isn't called gerrit, run
  `jj config set --repo gerrit.default_remote <gerrit remote name>` to set-up a
  default remote.
* To upload to a specific remote as a one-off thing, use `--remote <remote name>`

## Updating changes after review[¶](https://www.jj-vcs.dev/latest/gerrit/index.html#updating-changes-after-review "Permanent link")

To address review feedback, update your revisions, then run `jj gerrit
upload` again with the same revsets. Gerrit will add new patch sets to the
existing changes instead of creating new ones.

Examples:

```
# Edit an earlier commit in the stack
$ jj edit xcv  # position on the stack to edit
 --- Apply needed edits ---
$ jj gerrit upload -r xcv
```

## `Change-Id` management[¶](https://www.jj-vcs.dev/latest/gerrit/index.html#change-id-management "Permanent link")

When uploading, `jj gerrit upload` adds a `Change-Id` footer based on the JJ
change id. That means that any changes made to a JJ change will become a new
patch set on the Gerrit change during the next upload.

Keep this association in mind when splitting or squashing changes. For example,
when splitting a change, the portion that you want associated with the
original Gerrit change should remain in the original JJ change (the first half
of the split). Similarly, when squashing new changes, you typically want to
squash into the change that was previously uploaded to Gerrit.

If your JJ changes no longer align with the desired mapping to Gerrit changes,
you can manually copy a Gerrit `Change-Id` footer into your JJ change
description to directly assign a JJ change to an exist Gerrit change.

As an alternative to `jj gerrit upload`'s automatic `Change-Id` mapping, you
can configure JJ to automatically add `Change-Id` footers to all change
descriptions:

```
[templates]
commit_trailers = '''
if(
  !trailers.contains_key("Change-Id"),
  format_gerrit_change_id_trailer(self)
)
'''
```

In this case, the Gerrit change mapping is defined entirely by the `Change-Id`
footers. When splitting or squashing changes, be sure to keep the `Change-Id`
footers associated with the desired changes. Be sure not to duplicate the same
`Change-Id` across different changes. Gerrit will reject pushes that contain
duplicate `Change-Id`s, but if the uploads are done separately, you may
unintentionally overwrite an existing change.
