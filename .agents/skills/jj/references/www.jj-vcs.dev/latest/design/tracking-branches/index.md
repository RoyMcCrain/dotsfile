---
title: "Tracking branches - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/design/tracking-branches/index"
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
  + Tracking branches

    [Tracking branches](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html)

    Table of contents
    - [Objective](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#objective)
    - [Current data model (as of jj 0.8.0)](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#current-data-model-as-of-jj-080)
    - [Proposed data model](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#proposed-data-model)

      * [Import/export data flow](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#importexport-data-flow)
      * [Tracking state](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#tracking-state)
      * [Mapping to the current data model](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#mapping-to-the-current-data-model)
    - [Common command behaviors](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#common-command-behaviors)

      * [fetch/import](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#fetchimport)
      * [push/export](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#pushexport)
      * [init/clone](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#initclone)
      * [branch](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#branch)
    - [Command behavior examples](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#command-behavior-examples)

      * [fetch/import](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#fetchimport_1)
      * [push](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#push)
      * [export](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#export)
      * [undo fetch](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#undo-fetch)
      * [@git remote](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#git-remote)
    - [Remaining issues](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#remaining-issues)
    - [References](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#references)
  + [Copy tracking and tracing](https://www.jj-vcs.dev/latest/design/copy-tracking/index.html)
  + [Secure config](https://www.jj-vcs.dev/latest/design/secure-config/index.html)
* [Development roadmap](https://www.jj-vcs.dev/latest/roadmap/index.html)
* [Changelog](https://www.jj-vcs.dev/latest/changelog/index.html)

Table of contents

* [Objective](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#objective)
* [Current data model (as of jj 0.8.0)](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#current-data-model-as-of-jj-080)
* [Proposed data model](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#proposed-data-model)

  + [Import/export data flow](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#importexport-data-flow)
  + [Tracking state](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#tracking-state)
  + [Mapping to the current data model](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#mapping-to-the-current-data-model)
* [Common command behaviors](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#common-command-behaviors)

  + [fetch/import](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#fetchimport)
  + [push/export](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#pushexport)
  + [init/clone](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#initclone)
  + [branch](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#branch)
* [Command behavior examples](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#command-behavior-examples)

  + [fetch/import](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#fetchimport_1)
  + [push](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#push)
  + [export](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#export)
  + [undo fetch](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#undo-fetch)
  + [@git remote](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#git-remote)
* [Remaining issues](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#remaining-issues)
* [References](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#references)

# Remote/`@git` tracking branches[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#remotegit-tracking-branches "Permanent link")

This is a plan to implement more Git-like remote tracking branch UX.

## Objective[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#objective "Permanent link")

`jj` imports all remote branches to local branches by default. As described in
[#1136](https://github.com/jj-vcs/jj/issues/1136), this doesn't interact nicely with Git if we have multiple Git remotes
with a number of branches. The `git.auto-local-bookmark` config can mitigate this
problem, but we'll get locally-deleted branches instead.

The goal of this plan is to implement

* proper support for tracking/non-tracking remote branches
* logically consistent data model for importing/exporting Git refs

## Current data model (as of jj 0.8.0)[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#current-data-model-as-of-jj-080 "Permanent link")

Under the current model, all remote branches are "tracking" branches, and
remote changes are merged into the local counterparts.

```
branches
  [name]:
    local_target?
    remote_targets[remote]: target
tags
  [name]: target
git_refs
  ["refs/heads/{name}"]: target             # last-known local branches
  ["refs/remotes/{remote}/{name}"]: target  # last-known remote branches
                                            # (copied to remote_targets)
  ["refs/tags/{name}"]: target              # last-known tags
git_head: target?
```

* Remote branches are stored in both `branches[name].remote_targets` and
  `git_refs["refs/remotes"]`. These two are mostly kept in sync, but there
  are two scenarios where remote-tracking branches and git refs can diverge:
  1. `jj branch forget`
  2. `jj op revert`/`restore` in colocated workspace
* Pseudo `@git` tracking branches are stored in `git_refs["refs/heads"]`. We
  need special case to resolve `@git` branches, and their behavior is slightly
  different from the other remote-tracking branches.

## Proposed data model[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#proposed-data-model "Permanent link")

We'll add a per-remote-branch `state` to distinguish non-tracking branches
from tracking ones.

```
state = new        # not merged in the local branch or tag
      | tracking   # merged in the local branch or tag
# `ignored` state could be added if we want to manage it by view, not by
# config file. target of ignored remote branch would be absent.
```

We'll add a per-remote view-like object to record the last known remote
branches. It will replace `branches[name].remote_targets` in the current model.
`@git` branches will be stored in `remotes["git"]`.

```
branches
  [name]: target
tags
  [name]: target
remotes
  ["git"]:
    branches
      [name]: target, state                 # refs/heads/{name}
    tags
      [name]: target, state = tracking      # refs/tags/{name}
    head: target?, state = TBD              # refs/HEAD
  [remote]:
    branches
      [name]: target, state                 # refs/remotes/{remote}/{name}
    tags: (empty)
    head: (empty)
git_refs                                    # last imported/exported refs
  ["refs/heads/{name}"]: target
  ["refs/remotes/{remote}/{name}"]: target
  ["refs/tags/{name}"]: target
```

With the proposed data model, we can

* naturally support remote branches which have no local counterparts
* deduplicate `branches[name].remote_targets` and `git_refs["refs/remotes"]`

### Import/export data flow[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#importexport-data-flow "Permanent link")

```
       export flow                              import flow
       -----------                              -----------
                        +----------------+                   --.
   +------------------->|backing Git repo|---+                 :
   |                    +----------------+   |                 : unchanged
   |[update]                                 |[copy]           : on "op restore"
   |                      +----------+       |                 :
   |      +-------------->| git_refs |<------+                 :
   |      |               +----------+       |               --'
   +--[compare]                            [diff]--+
          |   .--       +---------------+    |     |         --.
          |   :    +--->|remotes["git"] |    |     |           :
          +---:    |    |               |<---+     |           :
              :    |    |remotes[remote]|          |           : restored
              '--  |    +---------------+          |[merge]    : on "op restore"
                   |                               |           : by default
             [copy]|    +---------------+          |           :
                   +----| (local)       |<---------+           :
                        | branches/tags |                      :
                        +---------------+                    --'
```

* `jj git import` applies diff between `git_refs` and `remotes[]`. `git_refs` is
  always copied from the backing Git repo.
* `jj git export` copies jj's `remotes` view back to the Git repo. If a ref in
  the Git repo has been updated since the last import, the ref isn't exported.
* `jj op restore` never rolls back `git_refs`.

### Tracking state[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#tracking-state "Permanent link")

The `git.auto-local-bookmark` config knob is applied when importing new remote
branch. `jj branch` sub commands will be added to change the tracking state.

```
fn default_state_for_newly_imported_branch(config, remote) {
    if remote == "git" {
        State::Tracked
    } else if config["git.auto-local-bookmark"] {
        State::Tracked
    } else {
        State::New
    }
}
```

A branch target to be merged is calculated based on the `state`.

```
fn target_in_merge_context(known_target, state) {
    match state {
        State::New => RefTarget::absent(),
        State::Tracked => known_target,
    }
}
```

### Mapping to the current data model[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#mapping-to-the-current-data-model "Permanent link")

* New `remotes["git"].branches` corresponds to `git_refs["refs/heads"]`, but
  forgotten branches are removed from `remotes["git"].branches`.
* New `remotes["git"].tags` corresponds to `git_refs["refs/tags"]`.
* New `remotes["git"].head` corresponds to `git_head`.
* New `remotes[remote].branches` corresponds to
  `branches[].remote_targets[remote]`.
* `state = new|tracking` doesn't exist in the current model. It's determined
  by `git.auto-local-bookmark` config.

## Common command behaviors[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#common-command-behaviors "Permanent link")

In the following sections, a merge is expressed as `adds - removes`.
In particular, a merge of local and remote targets is
`[local, remote] - [known_remote]`.

### fetch/import[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#fetchimport "Permanent link")

* `jj git fetch`

  1. Fetches remote changes to the backing Git repo.
  2. Import changes only for `remotes[remote].branches[glob]` (see below)
     + TODO: how about fetched `.tags`?
* `jj git import`

  1. Copies `git_refs` from the backing Git repo.
  2. Calculates diff from the known `remotes` to the new `git_refs`.
     + `git_refs["refs/heads"] - remotes["git"].branches`
     + `git_refs["refs/tags"] - remotes["git"].tags`
     + TBD: `"HEAD" - remotes["git"].head` (unused)
     + `git_refs["refs/remotes/{remote}"] - remotes[remote]`
  3. Merges diff in local `branches` and `tags` if `state` is `tracking`.
     + If the known `target` is `absent`, the default `state` should be
       calculated. This also applies to previously-forgotten branches.
  4. Updates `remotes` reflecting the import.
  5. Abandons commits that are no longer referenced.

### push/export[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#pushexport "Permanent link")

* `jj git push`

  1. Calculates diff from the known `remotes[remote]` to the local changes.
     + `branches - remotes[remote].branches`
       - If `state` is `new` (i.e. untracked), the known remote branch `target`
         is considered `absent`.
       - If `state` is `new`, and if the local branch `target` is `absent`, the
         diff `[absent, remote] - absent` is noop. So it's not allowed to push
         deleted branch to untracked remote.
       - TODO: Copy Git's `--force-with-lease` behavior?
     + ~`tags`~ (not implemented, but should be the same as `branches`)
  2. Pushes diff to the remote Git repo (as well as remote tracking branches
     in the backing Git repo.)
  3. Updates `remotes[remote]` and `git_refs` reflecting the push.
* `jj git export`

  1. Copies local `branches`/`tags` back to `remotes["git"]`.
     + Conceptually, `remotes["git"].branches[name].state` can be set to
       untracked. Untracked local branches won't be exported to Git.
     + If `remotes["git"].branches[name]` is `absent`, the default
       `state = tracking` applies. This also applies to forgotten branches.
     + ~`tags`~ (not implemented, but should be the same as `branches`)
  2. Calculates diff from the known `git_refs` to the new `remotes[remote]`.
  3. Applies diff to the backing Git repo.
  4. Updates `git_refs` reflecting the export.

  If a ref failed to export at the step 3, the preceding steps should also be
  rolled back for that ref.

### init/clone[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#initclone "Permanent link")

* `jj init`

  + Import, track, and merge per `git.auto_local_branch` config.
  + If `!git.auto_local_branch`, no `tracking` state will be set.
* `jj git clone`

  + Import, track, and merge per `git.auto_local_branch` config.
  + The default branch will be tracked regardless of `git.auto_local_branch`
    config. This isn't technically needed, but will help users coming from Git.

### branch[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#branch "Permanent link")

* `jj branch set {name}`
  1. Sets local `branches[name]` entry.
* `jj branch delete {name}`
  1. Removes local `branches[name]` entry.
* `jj branch forget {name}`
  1. Removes local `branches[name]` entry if exists.
  2. Removes `remotes[remote].branches[name]` entries if exist.
     TODO: maybe better to not remove non-tracking remote branches?
* `jj branch track {name}@{remote}` (new command)
  1. Merges `[local, remote] - [absent]` in local branch.
     + Same as "fetching/importing existing branch from untracked remote".
  2. Sets `remotes[remote].branches[name].state = tracking`.
* `jj branch untrack {name}@{remote}` (new command)
  1. Sets `remotes[remote].branches[name].state = new`.
* `jj branch list`
  + TODO: hide non-tracking branches by default? ...

Note: desired behavior of `jj branch forget` is to

* discard both local and remote branches (without actually removing branches
  at remotes)
* not abandon commits which belongs to those branches (even if the branch is
  removed at a remote)

## Command behavior examples[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#command-behavior-examples "Permanent link")

### fetch/import[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#fetchimport_1 "Permanent link")

* Fetching/importing new branch
  1. Decides new `state = new|tracking` based on `git.auto_local_branch`
  2. If new `state` is `tracking`, merges `[absent, new_remote] - [absent]`
     (i.e. creates local branch with `new_remote` target)
  3. Sets `remotes[remote].branches[name].state`
* Fetching/importing existing branch from tracking remote
  1. Merges `[local, new_remote] - [known_remote]`
* Fetching/importing existing branch from untracked remote
  1. Decides new `state = new|tracking` based on `git.auto_local_branch`
  2. If new `state` is `tracking`, merges `[local, new_remote] - [absent]`
  3. Sets `remotes[remote].branches[name].state`
* Fetching/importing remotely-deleted branch from tracking remote
  1. Merges `[local, absent] - [known_remote]`
  2. Removes `remotes[remote].branches[name]` (`target` becomes `absent`)
     (i.e. the remote branch is no longer tracked)
  3. Abandons commits in the deleted branch
* Fetching/importing remotely-deleted branch from untracked remote
  1. Decides new `state = new|tracking` based on `git.auto_local_branch`
  2. Noop anyway since `[local, absent] - [absent]` -> `local`
* Fetching previously-forgotten branch from remote
  1. Decides new `state = new|tracking` based on `git.auto_local_branch`
  2. If new `state` is `tracking`, merges
     `[absent, new_remote] - [absent]` -> `new_remote`
  3. Sets `remotes[remote].branches[name].state`
* Fetching forgotten and remotely-deleted branch
  + Same as "remotely-deleted branch from untracked remote" since forgotten
    remote branch should be `state = new`
  + Therefore, no local commits should be abandoned

### push[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#push "Permanent link")

* Pushing new branch, remote doesn't exist
  1. Pushes `[local, absent] - [absent]` -> `local`
  2. Sets `remotes[remote].branches[name].target = local`, `.state = tracking`
* Pushing new branch, untracked remote exists
  1. Pushes `[local, remote] - [absent]`
     + Fails if `local` moved backwards or sideways
  2. Sets `remotes[remote].branches[name].target = local`, `.state = tracking`
* Pushing existing branch to tracking remote
  1. Pushes `[local, remote] - [remote]` -> `local`
     + Fails if `local` moved backwards or sideways, and if `remote` is out of
       sync
  2. Sets `remotes[remote].branches[name].target = local`
* Pushing existing branch to untracked remote
  + Same as "new branch"
* Pushing deleted branch to tracking remote
  1. Pushes `[absent, remote] - [remote]` -> `absent`
     + TODO: Fails if `remote` is out of sync?
  2. Removes `remotes[remote].branches[name]` (`target` becomes `absent`)
* Pushing deleted branch to untracked remote
  + Noop since `[absent, remote] - [absent]` -> `remote`
  + Perhaps, UI will report error
* Pushing forgotten branch to untracked remote
  + Same as "deleted branch to untracked remote"
* Pushing previously-forgotten branch to remote
  + Same as "new branch, untracked remote exists"
  + The `target` of forgotten remote branch is `absent`

### export[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#export "Permanent link")

* Exporting new local branch, git branch doesn't exist
  1. Sets `remotes["git"].branches[name].target = local`, `.state = tracking`
  2. Exports `[local, absent] - [absent]` -> `local`
* Exporting new local branch, git branch is out of sync
  1. Exports `[local, git] - [absent]` -> fail
* Exporting existing local branch, git branch is synced
  1. Sets `remotes["git"].branches[name].target = local`
  2. Exports `[local, git] - [git]` -> `local`
* Exporting deleted local branch, git branch is synced
  1. Removes `remotes["git"].branches[name]`
  2. Exports `[absent, git] - [git]` -> `absent`
* Exporting forgotten branches, git branches are synced
  1. Exports `[absent, git] - [git]` -> `absent` for forgotten local/remote
     branches

### undo fetch[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#undo-fetch "Permanent link")

* Exporting undone fetch, git branches are synced
  1. Exports `[old, git] - [git]` -> `old` for undone local/remote branches
* Redoing undone fetch without exporting
  + Same as plain fetch since the known `git_refs` isn't diffed against the
    refs in the backing Git repo.

### `@git` remote[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#git-remote "Permanent link")

* `jj branch untrack {name}@git`
  + Maybe rejected (to avoid confusion)?
  + Allowing this would mean different local branches of the same name coexist
    in jj and git.
* `jj git fetch --remote git`
  + Rejected. The implementation is different.
  + Conceptually, it's `git::import_refs()` only for local branches.
* `jj git push --remote git`
  + Rejected. The implementation is different.
  + Conceptually, it's `jj branch track` and `git::export_refs()` only for
    local branches.

## Remaining issues[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#remaining-issues "Permanent link")

* <https://github.com/jj-vcs/jj/issues/1278> pushing to tracked remote
  + Option could be added to push to all `tracking` remotes?
* Track remote branch locally with different name
  + Local branch name could be stored per remote branch
  + Consider UI complexity
* "private" state (suggested by @ilyagr)
  + "private" branches can be pushed to their own remote, but not to the
    upstream repo
  + This might be a state attached to a local branch (similar to Mercurial's
    "secret" phase)

## References[¶](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html#references "Permanent link")

* <https://github.com/jj-vcs/jj/issues/1136>
* <https://github.com/jj-vcs/jj/issues/1666>
* <https://github.com/jj-vcs/jj/issues/1690>
* <https://github.com/jj-vcs/jj/issues/1734>
* <https://github.com/jj-vcs/jj/pull/1739>
