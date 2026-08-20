---
title: "Working copy - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/working-copy/index"
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
  + Working copy

    [Working copy](https://www.jj-vcs.dev/latest/working-copy/index.html)

    Table of contents
    - [Introduction](https://www.jj-vcs.dev/latest/working-copy/index.html#introduction)
    - [Conflicts](https://www.jj-vcs.dev/latest/working-copy/index.html#conflicts)
    - [Ignored files](https://www.jj-vcs.dev/latest/working-copy/index.html#ignored-files)
    - [Workspaces](https://www.jj-vcs.dev/latest/working-copy/index.html#workspaces)
    - [Stale working copy](https://www.jj-vcs.dev/latest/working-copy/index.html#stale-working-copy)
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

* [Introduction](https://www.jj-vcs.dev/latest/working-copy/index.html#introduction)
* [Conflicts](https://www.jj-vcs.dev/latest/working-copy/index.html#conflicts)
* [Ignored files](https://www.jj-vcs.dev/latest/working-copy/index.html#ignored-files)
* [Workspaces](https://www.jj-vcs.dev/latest/working-copy/index.html#workspaces)
* [Stale working copy](https://www.jj-vcs.dev/latest/working-copy/index.html#stale-working-copy)

# Working copy[¶](https://www.jj-vcs.dev/latest/working-copy/index.html#working-copy "Permanent link")

## Introduction[¶](https://www.jj-vcs.dev/latest/working-copy/index.html#introduction "Permanent link")

The working copy is where the current working-copy commit's files are written so
you can interact with them. It is also where files are read from in order to
create new commits (though there are many other ways of creating new commits).

Unlike most other VCSs, Jujutsu will automatically create commits from the
working-copy contents when they have changed. Most `jj` commands you run will
commit the working-copy changes if they have changed. The resulting revision
will replace the previous working-copy revision.

Also unlike most other VCSs, added files are implicitly tracked by default. That
means that if you add a new file to the working copy, it will be automatically
committed once you run e.g. `jj st`. Similarly, if you remove a file from the
working copy, it will implicitly be untracked.

The `snapshot.auto-track` config option controls which paths get automatically
tracked when they're added to the working copy. See the
[fileset documentation](https://www.jj-vcs.dev/latest/filesets/index.html) for the syntax. Files with paths matching
[ignore files](https://www.jj-vcs.dev/latest/working-copy/index.html#ignored-files) are never tracked automatically.

If you set `snapshot.auto-track` to a non-default value, untracked files can be
tracked with `jj file track`.

You can use `jj file untrack` to untrack a file while keeping it in the working
copy. However, first [ignore](https://www.jj-vcs.dev/latest/working-copy/index.html#ignored-files) them or remove them from the
`snapshot.auto-track` patterns; otherwise they will be immediately tracked again.

## Conflicts[¶](https://www.jj-vcs.dev/latest/working-copy/index.html#conflicts "Permanent link")

When you check out a commit with conflicts, those conflicts need to be
represented in the working copy somehow. However, the file system doesn't
understand conflicts. Jujutsu's solution is to add conflict markers to
conflicted files when it writes them to the working copy. It also keeps track of
the (typically 3) different parts involved in the conflict. Whenever it scans
the working copy thereafter, it parses the conflict markers and recreates the
conflict state from them. You can resolve conflicts by replacing the conflict
markers by the resolved text. You don't need to resolve all conflicts at once.
You can even resolve part of a conflict by updating the different parts of the
conflict marker.

To resolve conflicts in a commit, use `jj new <commit>` to create a working-copy
commit on top. You would then have the same conflicts in the working-copy
commit. Once you have resolved the conflicts, you can inspect the conflict
resolutions with `jj diff`. Then run `jj squash` to move the conflict
resolutions into the conflicted commit. Alternatively, you can edit the commit
with conflicts directly in the working copy by using `jj edit <commit>`. The
main disadvantage of that is that it's harder to inspect the conflict
resolutions.

With the `jj resolve` command, you can use an external merge tool to resolve
conflicts that have 2 sides and a base. There is not yet a good way of
resolving conflicts between directories, files, and symlinks
(<https://github.com/jj-vcs/jj/issues/19>). You can use `jj restore` to choose
one side of the conflict, but there's no way to even see where the involved
parts came from.

## Ignored files[¶](https://www.jj-vcs.dev/latest/working-copy/index.html#ignored-files "Permanent link")

You probably don't want build outputs and temporary files to be under version
control. You can tell Jujutsu to not automatically track certain files by using
`.gitignore` files (there's no such thing as `.jjignore` yet). See
<https://git-scm.com/docs/gitignore> for details about the format. `.gitignore`
files are supported in any directory in the working copy, as well as in
`$XDG_CONFIG_HOME/git/ignore` and `$GIT_DIR/info/exclude`.

Ignored files are never tracked automatically (regardless of the value of
`snapshot.auto-track`), but files that were already tracked will remain tracked
even if they match ignore patterns. You can untrack such files with the
`jj file untrack` command.

## Workspaces[¶](https://www.jj-vcs.dev/latest/working-copy/index.html#workspaces "Permanent link")

You can have multiple working copies backed by a single repo. Use
`jj workspace add` to create a new working copy. The working copy will have a
`.jj/` directory linked to the main repo. The working copy and the `.jj/`
directory together is called a "workspace". Each workspace can have a different
commit checked out.

Having multiple workspaces can be useful for running long-running tests in a one
while you continue developing in another, for example. If needed,
`jj workspace root` prints the root path of the current workspace.

When you're done using a workspace, use `jj workspace forget` to make the repo
forget about it. The files can be deleted from disk separately (either before or
after).

## Stale working copy[¶](https://www.jj-vcs.dev/latest/working-copy/index.html#stale-working-copy "Permanent link")

Almost all commands go through three main steps:

1. Snapshot the working copy (which gets recorded as an operation)
2. Create new commits etc. "in memory" and record that as a new operation
3. Update the working copy to match the new operation, i.e. to the commit that
   the operation says that `@` should point to

If step 3 doesn't happen for some reason, the working copy is considered
"stale". We can detect that because the working copy (`.jj/working_copy/`)
keeps track of which operation it was last updated to. When the working copy is
stale, use `jj workspace update-stale` to update the files in the working copy.

A common reason that step 3 doesn't happen for a working copy is that you
rewrote the commit from another workspace. When you modify workspace A's
working-copy commit from workspace B, workspace A's working copy will become
stale.

A working copy can also become stale because some error, such as `^C` prevented
step 3 from completing. It's also possible that it was successfully updated in
step 3 but the operation has then been lost (e.g. by `jj op abandon` or
"spontaneously" by certain storage backends). If the operation has been lost,
then `jj workspace update-stale` will create a recovery commit with the
contents of the working copy but parented to the current operation's
working-copy commit.
