---
title: "Sparse patterns v2 - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/design/sparse-v2/index"
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
  + Sparse patterns v2

    [Sparse patterns v2](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html)

    Table of contents
    - [Objective](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#objective)
    - [Current State (as of jj 0.13.0)](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#current-state-as-of-jj-0130)
    - [Proposed State (Sparse Patterns v2)](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#proposed-state-sparse-patterns-v2)

      * [Command Syntax](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#command-syntax)

        + [Canonicalization](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#canonicalization)
      * [Working Copy Map](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#working-copy-map)

        + [Command Syntax](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#command-syntax_1)
      * [Versioning and Storage](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#versioning-and-storage)

        + [View Updates](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#view-updates)
      * [Appendix](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#appendix)

        + [Related Work](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#related-work)
        + [Patterns via configuration](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#patterns-via-configuration)
  + [Tracking branches](https://www.jj-vcs.dev/latest/design/tracking-branches/index.html)
  + [Copy tracking and tracing](https://www.jj-vcs.dev/latest/design/copy-tracking/index.html)
  + [Secure config](https://www.jj-vcs.dev/latest/design/secure-config/index.html)
* [Development roadmap](https://www.jj-vcs.dev/latest/roadmap/index.html)
* [Changelog](https://www.jj-vcs.dev/latest/changelog/index.html)

Table of contents

* [Objective](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#objective)
* [Current State (as of jj 0.13.0)](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#current-state-as-of-jj-0130)
* [Proposed State (Sparse Patterns v2)](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#proposed-state-sparse-patterns-v2)

  + [Command Syntax](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#command-syntax)

    - [Canonicalization](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#canonicalization)
  + [Working Copy Map](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#working-copy-map)

    - [Command Syntax](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#command-syntax_1)
  + [Versioning and Storage](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#versioning-and-storage)

    - [View Updates](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#view-updates)
  + [Appendix](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#appendix)

    - [Related Work](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#related-work)
    - [Patterns via configuration](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#patterns-via-configuration)

# Sparse Patterns v2 redesign[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#sparse-patterns-v2-redesign "Permanent link")

Authors: [Daniel Ploch](mailto:dploch@google.com)

**Summary:** This Document documents a redesign of the sparse command and
it's internal storage format in jj, in order to facilitate several desirable
improvements for large repos. It covers both the migration path and the planned
end state.

## Objective[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#objective "Permanent link")

Redesign Sparse Patterns to accommodate more advanced features for native
and custom implementations. This includes three main goals:

1. Sparse Patterns should be versioned with the working copy
2. Sparse Patterns should support more [flexible matching rules](https://github.com/jj-vcs/jj/issues/1896)
3. Sparse Patterns should support [client path remapping](https://github.com/jj-vcs/jj/issues/2288)

## Current State (as of jj 0.13.0)[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#current-state-as-of-jj-0130 "Permanent link")

Sparse patterns are an effectively unordered list of prefix strings:

```
path/one
path/to/dir/two
```

The *set* of files identified by the Sparse Patterns is all paths which match
any provided prefix. This governs what gets materialized in the working copy on
checkout, and what is updated on snapshot. The set is stored in working copy
state files which are not versioned in the Op Store.

Because all paths are bare strings with no escaping or higher-level formatting,
the current design makes it difficult to add new features like exclusions or
path remappings.

## Proposed State (Sparse Patterns v2)[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#proposed-state-sparse-patterns-v2 "Permanent link")

Sparse Patterns v2 will be stored as objects in the Op Store, referenced
by a `WorkingCopyPatternsId` from the active `View`. They will have a new,
ordered structure which can fully represent previous patterns.

```
/// Analogues of RepoPath, specifically describing paths in the working copy.
struct WorkingCopyPathBuf {
    String
}
struct WorkingCopyPath {
    str
}

pub enum SparsePatternsPathType {
    Dir,    // Everything under <path>/...
    Files,  // Files under <path>/*
    Exact,  // <path> exactly
}

pub struct SparsePatternsPath {
    path_type: SparsePatternsPathType,
    include: bool,  // True if included, false if excluded.
    path: RepoPathBuf,
}

pub struct WorkingCopyMapping {
    src_path: RepoPathBuf,
    dst_path: WorkingCopyPathBuf,
    recursive: bool,  // If false, only immediate children of src_path (files) are renamed.
}

pub struct WorkingCopyPatterns {
    sparse_paths: Vec<SparsePatternsPath>,
    mappings: Vec<WorkingCopyMapping>,
}

pub trait OpStore {
    ...
    pub fn read_working_copy_patterns(&self, id: &WorkingCopyPatternsId) -> OpStoreResult<WorkingCopyPatterns> { ... }
    pub fn write_working_copy_patterns(&self, sparse_patterns: &WorkingCopyPatterns) -> OpStoreResult<WorkingCopyPatternsId> { .. }
}
```

To support these more complex behaviors, a new `WorkingCopyPatterns` trait will
be introduced, initially only as a thin wrapper around the existing prefix
format, but soon to be expanded with richer types and functionality.

```
impl WorkingCopyPatterns {
    pub fn to_matcher(&self) -> Box<dyn Matcher> {
        ...
    }

    ...
}
```

### Command Syntax[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#command-syntax "Permanent link")

`SparsePatternsPath` rules can be specified on the CLI and in an editor via a
compact syntax:

```
(include|exclude):(dir|files|exact):<path>
```

If both prefix terms are omitted, then `include:dir:` is assumed. If any prefix
is specified, both must be specified. The editor and CLI will both accept path
rules in either format going forward.

* `jj sparse set --add foo/bar` is equal to `jj sparse set --add include:dir:foo/bar`
* `jj sparse set --add exclude:dir:foo/bar` adds a new `Dir` type rule with `include = false`
* `jj sparse set --exclude foo/bar` as a possible shorthand for the above
* `jj sparse list` will print the explicit rules

Paths will be stored in an ordered, canonical form which unambiguously describes
the set of files to be included. Every `--add` command will append to the end of
this list before the patterns are canonicalized. Whether a file is included is
determined by the first matching rule in reverse order.

For example:

```
include:dir:foo
exclude:dir:foo/bar
include:dir:foo/bar/baz
exclude:dir:foo/bar/baz/qux
```

Produces rule set which includes "foo/file.txt", excludes "foo/bar/file.txt",
includes "foo/bar/baz/file.txt", and excludes "foo/bar/baz/qux/file.txt".

If the rules are subtly re-ordered, they become canonicalized to a smaller, but
functionally equivalent form:

```
# Before
include:dir:foo
exclude:dir:foo/bar/baz/qux
include:dir:foo/bar/baz
exclude:dir:foo/bar

# Canonicalized
include:dir:foo
exclude:dir:foo/bar
```

#### Canonicalization[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#canonicalization "Permanent link")

There are many ways to represent functionally equivalent `WorkingCopyPatterns`.
For instance, the following 4 rule sets are all functionally equivalent:

```
# Set 1
include:dir:bar
include:dir:foo

# Set 2
include:dir:foo
include:dir:bar

# Set 3
include:dir:bar
include:dir:bar/baz/qux
include:dir:foo

# Set 4
include:dir:foo
exclude:dir:foo/baz
include:dir:bar
include:dir:foo/baz
```

Because these patterns are stored in the Op Store now, it is useful for all of
these representations to be rewritten into a minimal, canonical form before
serialization. In this case, `Set 1` will be the canonical set. The canonical
form of a `WorkingCopyPatterns` is defined as the form such that:

* Every rule affects the functionality (there are no redundant rules)
* Rules are sorted lexicographically, but with '/' sorted before all else
  + This special sorting order is useful for constructing path tries

### Working Copy Map[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#working-copy-map "Permanent link")

Warning

This section is intentionally lacking, more research is needed.

All `WorkingCopyPatterns` will come equipped with a default no-op mapping.
These mappings are inspired by and similar to [Perforce client views](https://www.perforce.com/manuals/cmdref/Content/CmdRef/views.html).

```
vec![WorkingCopyMapping {
    src_path: RepoPathBuf::root(),
    dst_path: WorkingCopyPathBuf::root(),
    recursive: true,
}]
```

`WorkingCopyPatterns` will provide an interface to map working copy paths into
repo paths and vice versa. The `WorkingCopy`` trait will apply this mapping to
all snapshot and checkout operations, and jj commands which accept relative
paths will need to be updated to perform working copy path -> repo path
translations as needed. It's not clear at this time *which* commands will need
changing, as some are more likely to refer to repo paths rather than working
copy paths.

TODO: Expand this section.

In particular, the path rules for sparse patterns will *always* be repo paths,
not working copy paths. Thus, if the working copy wants to track "foo" and
rename it to "subdir/bar", they must `jj sparse set --add foo` and
`jj map set --from foo --to bar`. In other words, the mapping operation can
be thought of as always *after* the sparse operation.

#### Command Syntax[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#command-syntax_1 "Permanent link")

New commands will enable editing of the `WorkingCopyMapping`s:

TODO: Maybe this should be `jj workspace map ...`?

* `jj map list` will print all mapping pairs.
* `jj map add --from foo --to bar` will add a new mapping to the end of the list.
* `jj map remove --from foo` will remove a specific mapping rule.
* `jj map edit` will pull up a text editor for manual editing.

Like sparse paths, mappings will have a compact text syntax for editing in file
form, or for adding a rule textually on the CLI:

```
"<from>" -> "<to>" [nonrecursive]
```

Like sparse paths, mapping rules are defined to apply in *order* and on any
save operation will be modified to a minimal canonical form. Thus,
`jj map set --from "" --to ""` will always completely wipe the map.
The first matching rule in reverse list order determines how a particular
repo path should be mapped into the working copy, and likewise how a particular
working copy path should be mapped into the repo. For simplicity, the
'last rule wins' applies both for repo->WC conversions, as well as WC->repo
conversions, using the same ordering.

If a working copy mapping places the same repo file at two distinct working
copy paths, snapshotting will fail unless these files are identical. Some
specialized filesystems may even treat these as the 'same' file, allowing this
to work in some cases.

If a working copy mapping places two distinct repo files at the same working
copy path, checkout will fail with an error regardless of equivalence.

### Versioning and Storage[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#versioning-and-storage "Permanent link")

Updating the active `WorkingCopyPatterns` for a particular working copy will now
take place in two separate steps: one transaction which updates the op store,
and a separate `LockedWorkingCopy` operation which actually updates the working
copy. The working copy proto will no longer store `WorkingCopyPatterns`
directly, instead storing only a `WorkingCopyPatternsId`. On mismatch with the
current op head, the user will be prompted to run `jj workspace update-stale`.

This gives the user the ability to update the active `WorkingCopyPatterns`
whilst not interacting with the local working copy, which is useful for custom
integrations which may not be *able* to check out particular working copy
patterns due to problems with the backend (encoding, permission errors, etc.). A
bad `jj sparse set --add oops` command can thus be undone, even via `jj op undo`
if desired.

#### View Updates[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#view-updates "Permanent link")

The View object will be migrated to store working copy patterns via id. The
indirection will save on storage since working copy patterns are not expected to
change very frequently.

```
// Before:
pub wc_commit_ids: HashMap<WorkspaceNameBuf, CommitId>,

// After:
pub struct WorkingCopyInfo {
    pub commit_id: CommitId,
    pub wc_patterns_id: WorkingCopyPatternsId,
}
...
pub wc_info: HashMap<WorkspaceNameBuf, WorkingCopyInfo>,
```

A View object with no stored working copy patterns will be modified at read
time to include the current working copy patterns, thus all `read_view`
operations will need to pass in the current working copy patterns for a
migration period of at least 6 months. After that, we may choose to auto-fill
missing working copy infos with a default `WorkingCopyPatterns` as needed.

### Appendix[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#appendix "Permanent link")

#### Related Work[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#related-work "Permanent link")

[Perforce client maps](https://www.perforce.com/manuals/cmdref/Content/CmdRef/views.html)
are very similar in concept to the entirety of `WorkingCopyPatterns`, and this
design aims to achieve similar functionality.

The [Josh Project](https://github.com/josh-project/josh) implements partial git
clones in a way similar to how sparse patterns try to work.

#### Patterns via configuration[¶](https://www.jj-vcs.dev/latest/design/sparse-v2/index.html#patterns-via-configuration "Permanent link")

There may be some scenarios where it is valuable to configure working copy
patterns via a configuration file, rather than through explicit commands.
Generally this only makes sense for automated repos, with the configuration
coming from outside the repo - there are too many caveats and edge cases if the
configuration comes from inside the repo and/or is fought with by a human.

No configuration syntax is planned at this time but if we add any, we should
probably reuse the compact line syntaxes as much as possible for consistency.
