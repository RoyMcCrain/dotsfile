---
title: "Concurrency - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/technical/concurrency/index"
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
  + Concurrency

    [Concurrency](https://www.jj-vcs.dev/latest/technical/concurrency/index.html)

    Table of contents
    - [Introduction](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#introduction)

      * [Syncing with rsync, NFS, Dropbox, etc](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#syncing-with-rsync-nfs-dropbox-etc)
    - [Operation log](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#operation-log)

      * [Merging divergent operations](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#merging-divergent-operations)
      * [Storage](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#storage)
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

* [Introduction](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#introduction)

  + [Syncing with rsync, NFS, Dropbox, etc](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#syncing-with-rsync-nfs-dropbox-etc)
* [Operation log](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#operation-log)

  + [Merging divergent operations](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#merging-divergent-operations)
  + [Storage](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#storage)

# Concurrency[¶](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#concurrency "Permanent link")

## Introduction[¶](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#introduction "Permanent link")

Concurrent editing is a key feature of DVCSs -- that's why they're called
*Distributed* Version Control Systems. A DVCS that didn't let users edit files
and create commits on separate machines at the same time wouldn't be much
of a distributed VCS.

When conflicting changes are made in different clones, a DVCS will have to deal
with that when you push or pull. For example, when using Mercurial, if the
remote has updated a bookmark called `main` (Mercurial's bookmarks are similar
to a Git's branches) and you had updated the same bookmark locally but made it
point to a different target, Mercurial would add a bookmark called `main@origin`
to indicate the conflict. Git instead prevents the conflict by renaming pulled
branches to `origin/main` whether or not there was a conflict. However, most
DVCSs treat local concurrency quite differently, typically by using lock files
to prevent concurrent edits. Unlike those DVCSs, Jujutsu treats concurrent edits
the same whether they're made locally or remotely.

One problem with using lock files is that they don't work when the clone is in a
distributed file system. Most clones are of course not stored in distributed
file systems, but it is a *big* problem when they are (Mercurial repos
frequently get corrupted, for example).

Another problem with using lock files is related to complexity of
implementation. The simplest way of using lock files is to take coarse-grained
locks early: every command that may modify the repo takes a lock at the very
beginning. However, that means that operations that wouldn't actually conflict
would still have to wait for each other. The user experience can be improved by
using finer-grained locks and/or taking the locks later. The drawback of that is
complexity. For example, you need to verify that any assumptions you made before
locking are still valid after you take the lock.

To avoid depending on lock files, Jujutsu takes a different approach by
accepting that concurrent changes can always happen. It instead exposes any
conflicting changes to the user, much like other DVCSs do for conflicting
changes made remotely.

### Syncing with `rsync`, NFS, Dropbox, etc[¶](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#syncing-with-rsync-nfs-dropbox-etc "Permanent link")

Jujutsu's lock-free concurrency means that it's possible to update copies of the
clone on different machines and then let `rsync` (or Dropbox, or NFS, etc.)
merge them. The working copy may mismatch what's supposed to be checked out, but
no changes to the repo will be lost (added commits, moved bookmarks, etc.). If
conflicting changes were made, they will appear as conflicts. For example, if a
bookmark was moved to two different locations, they will appear in `jj log` in
both locations but with a "?" after the name, and `jj status` will also inform
the user about the conflict.

Note that, for now, there are known bugs in this area. Most notably, with the
Git backend, [repository corruption is possible because the backend is not
entirely lock-free](https://github.com/jj-vcs/jj/issues/2193). If you know
about the bug, it is relatively easy to recover from.

Moreover, such use of Jujutsu is not currently thoroughly tested,
especially in the context of [colocated
repositories](https://www.jj-vcs.dev/latest/glossary/index.html#colocated-workspaces). While the contents of commits
should be safe, concurrent modification of a repository from different computers
might conceivably lose some bookmark pointers. Note that, unlike in pure
Git, losing a bookmark pointer does not lead to losing commits.

## Operation log[¶](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#operation-log "Permanent link")

The most important piece in the lock-free design is the "operation log". That is
what allows us to detect and merge divergent operations.

The operation log is similar to a commit DAG (such as in
[Git's object model](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)),
but each commit object is instead an "operation" and each tree object is instead
a "view". The view object contains the set of visible head commits, bookmarks,
tags, and the working-copy commit in each workspace. The operation object
contains a pointer to the view object (like how commit objects point to tree
objects), pointers to parent operation(s) (like how commit objects point to
parent commit(s)), and metadata about the operation. These types are defined
in `op_store.proto` The operation log is normally linear.
It becomes non-linear if there are divergent operations.

When a command starts, it loads the repo at the latest operation. Because the
associated view object completely defines the repo state, the running command
will not see any changes made by other processes thereafter. When the operation
completes, it is written with the start operation as parent. The operation
cannot fail to commit (except for disk failures and such). It is left for the
next command to notice if there were divergent operations. It will have to be
able to do that anyway since the concurrent operation could have arrived via a
distributed file system. This model -- where each operation sees a consistent
view of the repo and is guaranteed to be able to commit their changes -- greatly
simplifies the implementation of commands.

It is possible to load the repo at a particular operation with
`jj --at-operation=<operation ID> <command>`. If the command is mutational, that
will result in a fork in the operation log. That works exactly the same as if
any later operations had not existed when the command started. In other words,
running commands on a repo loaded at an earlier operation works the same way as
if the operations had been concurrent. This can be useful for simulating
divergent operations.

### Merging divergent operations[¶](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#merging-divergent-operations "Permanent link")

If Jujutsu tries to load the repo and finds multiple heads in the operation log,
it will do a 3-way merge of the view objects based on their common ancestor
(possibly several 3-way merges if there were more than two heads). Conflicts
are recorded in the resulting view object. For example, if bookmark `main` was
moved from commit A to commit B in one operation and moved to commit C in a
concurrent operation, then `main` will be recorded as "moved from A to B or C".
See the `RefTarget` definition in `op_store.proto`.

Because we allow bookmarks (etc.) to be in a conflicted state rather than just
erroring out when there are multiple heads, the user can continue to use the
repo, including performing further operations on the repo. Of course, some
commands will fail when using a conflicted bookmark. For example,
`jj new main` when `main` is in a conflicted state will result in an error
telling you that `main` resolved to multiple revisions.

### Storage[¶](https://www.jj-vcs.dev/latest/technical/concurrency/index.html#storage "Permanent link")

The operation objects and view objects are stored in content-addressed storage
just like Git commits are. That makes them safe to write without locking.

We also need a way of finding the current head of the operation log. We do that
by keeping the ID of the current head(s) as a file in a directory. The ID is the
name of the file; it has no contents. When an operation completes, we add a file
pointing to the new operation and then remove the file pointing to the old
operation. Writing the new file is what makes the operation visible (if the old
file didn't get properly deleted, then future readers will take care of that).
This scheme ensures that transactions are atomic.
