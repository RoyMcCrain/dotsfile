---
title: "Conflicts - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/conflicts/index"
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
  + Conflicts

    [Conflicts](https://www.jj-vcs.dev/latest/conflicts/index.html)

    Table of contents
    - [Introduction](https://www.jj-vcs.dev/latest/conflicts/index.html#introduction)
    - [Advantages](https://www.jj-vcs.dev/latest/conflicts/index.html#advantages)
    - [Conflict markers](https://www.jj-vcs.dev/latest/conflicts/index.html#conflict-markers)
    - [Alternative conflict marker styles](https://www.jj-vcs.dev/latest/conflicts/index.html#alternative-conflict-marker-styles)
    - [Long conflict markers](https://www.jj-vcs.dev/latest/conflicts/index.html#long-conflict-markers)
    - [Conflicts with missing terminating newline](https://www.jj-vcs.dev/latest/conflicts/index.html#conflicts-with-missing-terminating-newline)
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

* [Introduction](https://www.jj-vcs.dev/latest/conflicts/index.html#introduction)
* [Advantages](https://www.jj-vcs.dev/latest/conflicts/index.html#advantages)
* [Conflict markers](https://www.jj-vcs.dev/latest/conflicts/index.html#conflict-markers)
* [Alternative conflict marker styles](https://www.jj-vcs.dev/latest/conflicts/index.html#alternative-conflict-marker-styles)
* [Long conflict markers](https://www.jj-vcs.dev/latest/conflicts/index.html#long-conflict-markers)
* [Conflicts with missing terminating newline](https://www.jj-vcs.dev/latest/conflicts/index.html#conflicts-with-missing-terminating-newline)

# First-class conflicts[¶](https://www.jj-vcs.dev/latest/conflicts/index.html#first-class-conflicts "Permanent link")

## Introduction[¶](https://www.jj-vcs.dev/latest/conflicts/index.html#introduction "Permanent link")

Conflicts happen when Jujutsu can't figure out how to merge different changes
made to the same file. For instance, this can happen if two people are working
on the same file and make different changes to the same part of the file, and
then their commits are merged together with `jj new` (or one is rebased onto the
other with `jj rebase`).

Unlike most other VCSs, Jujutsu can record conflicted states in commits. For
example, if you rebase a commit and it results in a conflict, the conflict will
be recorded in the rebased commit and the rebase operation will succeed. You can
then resolve the conflict whenever you want. Conflicted states can be further
rebased, merged, or backed out. Note that what's stored in the commit is a
logical representation of the conflict, not conflict *markers*; rebasing a
conflict doesn't result in a nested conflict markers (see
[technical doc](https://www.jj-vcs.dev/latest/technical/conflicts/index.html) for how this works).

## Advantages[¶](https://www.jj-vcs.dev/latest/conflicts/index.html#advantages "Permanent link")

The deeper understanding of conflicts has many advantages:

* Removes the need for things like
  `git rebase/merge/cherry-pick/etc --continue`. Instead, you get a single
  workflow for resolving conflicts: check out the conflicted commit, resolve
  conflicts, and amend.
* Enables the "auto-rebase" feature, where descendants of rewritten commits
  automatically get rewritten. This feature mostly replaces Mercurial's
  [Changeset Evolution](https://www.mercurial-scm.org/wiki/ChangesetEvolution).
* Lets us define the change in a merge commit as being compared to the merged
  parents. That way, we can rebase merge commits correctly (unlike both Git and
  Mercurial). That includes conflict resolutions done in the merge commit,
  addressing a common use case for
  [git rerere](https://git-scm.com/docs/git-rerere).
  Since the changes in a merge commit are displayed and rebased as expected,
  [evil merges](https://git-scm.com/docs/gitglossary/2.22.0#Documentation/gitglossary.txt-aiddefevilmergeaevilmerge)
  are arguably not as evil anymore.
* Allows you to postpone conflict resolution until you're ready for it. You
  can easily keep all your work-in-progress commits rebased onto upstream's head
  if you like.
* [Criss-cross merges](https://stackoverflow.com/questions/26370185/how-do-criss-cross-merges-arise-in-git)
  and [octopus merges](https://git-scm.com/docs/git-merge#Documentation/git-merge.txt-octopus)
  become trivial (implementation-wise); some cases that Git can't currently
  handle, or that would result in nested conflict markers, can be automatically
  resolved.
* Enables collaborative conflict resolution. (This assumes that you can share
  the conflicts with others, which you probably shouldn't do if some people
  interact with your project using Git.)

For information about how conflicts are handled in the working copy, see
[here](https://www.jj-vcs.dev/latest/working-copy/index.html#conflicts).

## Conflict markers[¶](https://www.jj-vcs.dev/latest/conflicts/index.html#conflict-markers "Permanent link")

Conflicts are "materialized" using *conflict markers* in various contexts. For
example, when you run `jj new` or `jj edit` on a commit with a conflict, it will
be materialized in the working copy. Conflicts are also materialized when they
are part of diff output (e.g. `jj show` on a commit that introduces or resolves
a conflict).

As an example, imagine that you have a file which contains the following text,
all in lowercase:

```
apple
grape
orange
```

One person replaces the word "grape" with "grapefruit" in commit A, while
another person changes every line to uppercase in commit B. If you merge the
changes together with `jj new A B`, the resulting commit will have a conflict
since Jujutsu can't figure out how to combine these changes. Therefore, Jujutsu
will materialize the conflict in the working copy using conflict markers, which
would look like this:

```
<<<<<<< conflict 1 of 1
%%%%%%% diff from: vpxusssl 38d49363 "merge base"
\\\\\\\        to: rtsqusxu 2768b0b9 "commit A"
 apple
-grape
+grapefruit
 orange
+++++++ ysrnknol 7a20f389 "commit B"
APPLE
GRAPE
ORANGE
>>>>>>> conflict 1 of 1 ends
```

The markers `<<<<<<<` and `>>>>>>>` indicate the start and end of a conflict
respectively. The marker `+++++++` indicates the start of a snapshot, while the
marker `%%%%%%%` indicates the start of a diff to apply to the snapshot. The
`\\\\\\\` marker just allows the label to be split across two lines to make it
more readable.

Therefore, to resolve this conflict, you would apply the diff (changing "grape"
to "grapefruit") to the snapshot (the side with every line in uppercase),
editing the file to look like this:

```
APPLE
GRAPEFRUIT
ORANGE
```

In practice, conflicts are usually 2-sided, meaning that there's only 2
conflicting changes being merged together at a time, but Jujutsu supports
conflicts with arbitrarily many sides, which can happen when merging 3 or more
commits at once. In that case, you would see a single snapshot section and
multiple diff sections.

Compared to just showing the content of each side of the conflict, the main
benefit of Jujutsu's style of conflict markers is that you don't need to spend
time manually comparing the sides to spot the differences between them. This is
especially beneficial for many-sided conflicts, since resolving them just
requires applying each diff to the snapshot one-by-one.

## Alternative conflict marker styles[¶](https://www.jj-vcs.dev/latest/conflicts/index.html#alternative-conflict-marker-styles "Permanent link")

If you prefer to just see the contents of each side of the conflict without the
diff, Jujutsu also supports a "snapshot" style, which can be enabled by setting
the `ui.conflict-marker-style` config option to "snapshot":

```
<<<<<<< conflict 1 of 1
+++++++ rtsqusxu 2768b0b9 "commit A"
apple
grapefruit
orange
------- vpxusssl 38d49363 "merge base"
apple
grape
orange
+++++++ ysrnknol 7a20f389 "commit B"
APPLE
GRAPE
ORANGE
>>>>>>> conflict 1 of 1 ends
```

Some tools expect Git-style conflict markers, so Jujutsu also supports [Git's
"diff3" style](https://git-scm.com/docs/git-merge#_how_conflicts_are_presented)
conflict markers by setting the `ui.conflict-marker-style` config option to
"git":

```
<<<<<<< rtsqusxu 2768b0b9 "commit A"
apple
grapefruit
orange
||||||| vpxusssl 38d49363 "merge base"
apple
grape
orange
=======
APPLE
GRAPE
ORANGE
>>>>>>> ysrnknol 7a20f389 "commit B"
```

This conflict marker style only supports 2-sided conflicts though, so it falls
back to the similar "snapshot" conflict markers if there are more than 2 sides
to the conflict.

## Long conflict markers[¶](https://www.jj-vcs.dev/latest/conflicts/index.html#long-conflict-markers "Permanent link")

Some files may contain lines which could be confused for conflict markers. For
instance, a line could start with `=======`, which looks like a Git-style
conflict marker. To ensure that it's always unambiguous which lines are conflict
markers and which are just part of the file contents, `jj` sometimes uses
conflict markers which are longer than normal:

```
<<<<<<<<<<<<<<< conflict 1 of 1
%%%%%%%%%%%%%%% diff from: wqvuxsty cb9217d5 "merge base"
\\\\\\\\\\\\\\\        to: kwntsput 0e15b770 "commit A"
-Heading
+HEADING
 =======
+++++++++++++++ mpnwrytz 52020ed6 "commit B"
New Heading
===========
>>>>>>>>>>>>>>> conflict 1 of 1 ends
```

## Conflicts with missing terminating newline[¶](https://www.jj-vcs.dev/latest/conflicts/index.html#conflicts-with-missing-terminating-newline "Permanent link")

When materializing conflicts, `jj` outputs them in a line-based format. This
format is easiest to interpret for text files that consist of a series of lines,
with each line terminated by a newline character (`\n`). This means that a text
file should either be empty, or it should end with a newline character.

While most text files follow this convention, some do not. When `jj` encounters
a missing terminating newline character in a conflict, it will add a comment to
the conflict markers to make the conflict easier to interpret. If you don't care
about whether your file ends with a terminating newline character, you can
generally ignore this comment and resolve the conflict normally.

For instance, if a file originally contained `grape` with no terminating newline
character, and one person changed `grape` to `grapefruit`, while another person
added the missing newline character to make `grape\n`, the resulting conflict
would look like this:

```
<<<<<<< conflict 1 of 1
+++++++ tlwwkqxk d121763d "commit A" (no terminating newline)
grapefruit
%%%%%%% diff from: qwpqssno fe561d93 "merge base" (no terminating newline)
\\\\\\\        to: poxkmrxy c735fe02 "commit B"
-grape
+grape
>>>>>>> conflict 1 of 1 ends
```

Therefore, a resolution of this conflict could be `grapefruit\n`, with the
terminating newline character added.
