---
title: "Git command table - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/git-command-table/index"
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
  + [git-submodules](https://www.jj-vcs.dev/latest/design/git-submodules/index.html)
  + [git-submodule-storage](https://www.jj-vcs.dev/latest/design/git-submodule-storage/index.html)
  + [JJ run](https://www.jj-vcs.dev/latest/design/run/index.html)
  + [Sparse patterns v2](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html)
  + [Tracking branches](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html)
  + [Copy tracking and tracing](https://www.jj-vcs.dev/latest/design/copy-tracking/index.html)
  + [Secure config](https://www.jj-vcs.dev/latest/design/secure-config/index.html)
* [Development roadmap](https://www.jj-vcs.dev/latest/roadmap/index.html)
* [Changelog](https://www.jj-vcs.dev/latest/changelog/index.html)

# Git command table[¶](https://www.jj-vcs.dev/latest/git-command-table/index.html#git-command-table "Permanent link")

Note that all `jj` commands can be run on any commit (not just the working-copy
commit), but that's left out of the table to keep it simple. For example,
`jj squash -r <revision>` will move the diff from that revision into its
parent.

| Use case | Git command | Jujutsu command | Notes |
| --- | --- | --- | --- |
| Create a new repo | `git init` | `jj git init [--no-colocate]` |  |
| Clone an existing repo | `git clone <source> <destination> [--origin <remote name>]` | `jj git clone <source> <destination> [--remote <remote name>]` | There is no support for cloning non-Git repos yet. |
| Update the local repo with all bookmarks/branches from a remote | `git fetch [<remote>]` | `jj git fetch [--remote <remote>]` | There is no support for fetching into non-Git repos yet. |
| Update a remote repo with all bookmarks/branches from the local repo | `git push --all [<remote>]` | `jj git push --all [--remote <remote>]` | There is no support for pushing from non-Git repos yet. |
| Update a remote repo with a single bookmark from the local repo | `git push <remote> <bookmark name>` | `jj git push --bookmark <bookmark name> [--remote <remote>]` | There is no support for pushing from non-Git repos yet. |
| Add a remote target to the repo | `git remote add <remote> <url>` | `jj git remote add <remote> <url>` |  |
| Show summary of current work and repo status | `git status` | `jj st` |  |
| Show diff of the current change | `git diff HEAD` | `jj diff` |  |
| Show diff of another change | `git diff <revision>^ <revision>` | `jj diff -r <revision>` |  |
| Show diff from another change to the current change | `git diff <revision>` | `jj diff --from <revision>` |  |
| Show diff from change A to change B | `git diff A B` | `jj diff --from A --to B` |  |
| Show all the changes in A..B | `git diff A...B` | `jj diff -r A..B` |  |
| Show description and diff of a change | `git show <revision>` | `jj show <revision>` |  |
| Add a file to the current change | `touch filename; git add filename` | `touch filename` |  |
| Remove a file from the current change | `git rm filename` | `rm filename` |  |
| Remove a previously tracked file from the current change, but keep it in the working copy | `git rm --cached filename` | `jj file untrack filename` | File name must match an ignore pattern to remain untracked. See [the documentation for working copies](https://www.jj-vcs.dev/latest/working-copy/index.html#introduction) for more. |
| Modify a file in the current change | `echo stuff >> filename` | `echo stuff >> filename` |  |
| Finish work on the current change and start a new change | `git commit -a` | `jj commit` |  |
| See compact log graph of ancestors of the current commit | `git log --oneline --graph` | `jj log -r ::@` |  |
| See compact log graph of all reachable commits | `git log --oneline --graph --all` | `jj log -r 'all()'` or `jj log -r ::` | In a Git-backed Jujutsu repository the Git command will also show all commits preserved by Jujutsu, including hidden commits. To exclude all commits only preserved by Jujutsu, replace `--all` by `--exclude refs/jj/* --all`. This will also exclude the Jujutsu-reachable commits though, if they are not Git-reachable. |
| Show compact log graph of commits not on the main branch | `git log --oneline --graph --branches --not upstream/main` | `jj log` |  |
| Show log of commits that have the string "stuff" in the changed lines | `git log -G stuff` | `jj log -r 'diff_contains(stuff)'` |  |
| List versioned files in the working copy | `git ls-files --cached` | `jj file list` |  |
| Search among files versioned in the repository | `git grep foo` | `grep foo $(jj file list)` or `rg --no-require-git foo` |  |
| Abandon the current change and start a new change | `git reset --hard` (cannot be undone) | `jj abandon` |  |
| Make the current change empty | `git reset --hard` (same as abandoning a change since Git has no concept of a "change") | `jj restore` |  |
| Abandon the parent of the working copy, but keep its diff in the working copy | `git reset --soft HEAD~` | `jj squash --from @-` |  |
| Discard working copy changes in some files | `git restore <paths>...` or `git checkout HEAD -- <paths>...` | `jj restore <paths>...` |  |
| Edit description (commit message) of the current change | Not supported | `jj describe` |  |
| Edit description (commit message) of the previous change | `git commit --amend --only` | `jj describe @-` |  |
| Edit description (commit message) of any change | `git commit --fixup=reword:X; git rebase --autosquash X^` | `jj describe X` |  |
| Temporarily put away the current change | `git stash` | `jj new @-` | The old working-copy commit remains as a sibling commit. The old working-copy commit X can be restored with `jj edit X`. |
| Start working on a new change based on the  bookmark/branch | `git switch -c topic main` or `git checkout -b topic main` (may need to stash or commit first) | `jj new main` |  |
| Merge branch A into the current change | `git merge A` | `jj new @ A` |  |
| Check out a named revision (or branch) to examine source | `git checkout v1.0.1` | `jj new v1.0.1` | Creates new empty change on top (see `jj new main`) |
| Move bookmark/branch A onto bookmark/branch B | `git rebase B A` (may need to rebase other descendant branches separately) | `jj rebase -b A -o B` |  |
| Move change A and its descendants onto change B | `git rebase --onto B A^ <some descendant bookmark>` (may need to rebase other descendant bookmarks separately) | `jj rebase -s A -o B` |  |
| Reorder changes from A-B-C-D to A-C-B-D | `git rebase -i A` | `jj rebase -r C --before B` |  |
| Move the diff in the current change into the parent change | `git commit --amend -a` | `jj squash` |  |
| Interactively move part of the diff in the current change into the parent change | `git add -p; git commit --amend` | `jj squash -i` |  |
| Move the diff in the working copy into an ancestor | `git commit --fixup=X; git rebase --autosquash X^` | `jj squash --into X` |  |
| Interactively move part of the diff in an arbitrary change to another arbitrary change | Not supported | `jj squash -i --from X --into Y` |  |
| Interactively split the changes in the working copy in two | `git commit -p` | `jj split` |  |
| Interactively split an arbitrary change in two | Not supported (can be emulated with the "edit" action in `git rebase -i`) | `jj split -r <revision>` |  |
| Interactively edit the diff in a given change | Not supported (can be emulated with the "edit" action in `git rebase -i`) | `jj diffedit -r <revision>` |  |
| Resolve conflicts and continue interrupted operation | `echo resolved > filename; git add filename; git rebase/merge/cherry-pick --continue` | `echo resolved > filename; jj squash` | Operations don't get interrupted, so no need to continue. |
| Create a copy of a commit on top of another commit | `git co <destination>; git cherry-pick <source>` | `jj duplicate <source> -o <destination>` |  |
| Find the root of the working copy (or check if in a repo) | `git rev-parse --show-toplevel` | `jj workspace root` |  |
| List bookmarks/branches | `git branch` | `jj bookmark list` or `jj b l` for short |  |
| Create a bookmark/branch | `git branch <name> <revision>` | `jj bookmark create <name> -r <revision>` |  |
| Move a bookmark/branch forward | `git branch -f <name> <revision>` | `jj bookmark move <name> --to <revision>` or `jj b m <name> -t <revision>` for short |  |
| Move a bookmark/branch backward or sideways | `git branch -f <name> <revision>` | `jj bookmark move <name> --to <revision> --allow-backwards` |  |
| Delete a bookmark/branch | `git branch --delete <name>` | `jj bookmark delete <name>` |  |
| See log of operations performed on the repo | Not supported | `jj op log` |  |
| Undo an earlier operation | Not supported | `jj undo` | A matching `jj redo` command exists as well. |
| Create a commit that cancels out a previous commit | `git revert <revision>` | `jj revert -r <revision> -B @` |  |
| Show what revision and author last modified each line of a file | `git blame <file>` | `jj file annotate <path>` |  |
