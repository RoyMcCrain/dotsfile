---
title: "Revset language - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/revsets/index"
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
  + Revset language

    [Revset language](https://www.jj-vcs.dev/latest/revsets/index.html)

    Table of contents
    - [Hidden revisions](https://www.jj-vcs.dev/latest/revsets/index.html#hidden-revisions)
    - [Symbols](https://www.jj-vcs.dev/latest/revsets/index.html#symbols)

      * [Priority](https://www.jj-vcs.dev/latest/revsets/index.html#priority)
    - [Operators](https://www.jj-vcs.dev/latest/revsets/index.html#operators)
    - [Functions](https://www.jj-vcs.dev/latest/revsets/index.html#functions)
    - [String patterns](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns)
    - [Date patterns](https://www.jj-vcs.dev/latest/revsets/index.html#date-patterns)
    - [Aliases](https://www.jj-vcs.dev/latest/revsets/index.html#aliases)

      * [Built-in Aliases](https://www.jj-vcs.dev/latest/revsets/index.html#built-in-aliases)
    - [Examples](https://www.jj-vcs.dev/latest/revsets/index.html#examples)
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

* [Hidden revisions](https://www.jj-vcs.dev/latest/revsets/index.html#hidden-revisions)
* [Symbols](https://www.jj-vcs.dev/latest/revsets/index.html#symbols)

  + [Priority](https://www.jj-vcs.dev/latest/revsets/index.html#priority)
* [Operators](https://www.jj-vcs.dev/latest/revsets/index.html#operators)
* [Functions](https://www.jj-vcs.dev/latest/revsets/index.html#functions)
* [String patterns](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns)
* [Date patterns](https://www.jj-vcs.dev/latest/revsets/index.html#date-patterns)
* [Aliases](https://www.jj-vcs.dev/latest/revsets/index.html#aliases)

  + [Built-in Aliases](https://www.jj-vcs.dev/latest/revsets/index.html#built-in-aliases)
* [Examples](https://www.jj-vcs.dev/latest/revsets/index.html#examples)

# Revsets[¶](https://www.jj-vcs.dev/latest/revsets/index.html#revsets "Permanent link")

Jujutsu supports a functional language for selecting a set of revisions.
Expressions in this language are called "revsets" (the idea comes from
[Mercurial](https://www.mercurial-scm.org/repo/hg/help/revsets)). The language
consists of symbols, operators, and functions.

Most `jj` commands accept a revset (or multiple). Many commands, such as
`jj edit <revset>` expect the revset to resolve to a single commit; it is an
error to pass a revset that resolves to more than one commit (or zero commits)
to such commands.

The words "revisions" and "commits" are used interchangeably in this document.

## Hidden revisions[¶](https://www.jj-vcs.dev/latest/revsets/index.html#hidden-revisions "Permanent link")

Most revsets search only the [visible commits](https://www.jj-vcs.dev/latest/glossary/index.html#visible-commits).
Other commits are only included if you explicitly mention them (e.g. by commit
ID, `<name>@<remote>` symbol, or `at_operation()` function).

If hidden commits are specified, their ancestors also become available to the
search space. They are included in `all()`, `x..`, `~x`, etc., but not in
`..visible_heads()`, etc. For example, `hidden_id | all()` is equivalent to
`hidden_id | ::(hidden_id | visible_heads())`.

## Symbols[¶](https://www.jj-vcs.dev/latest/revsets/index.html#symbols "Permanent link")

The `@` expression refers to the working copy commit in the current workspace.
Use `<workspace name>@` to refer to the working-copy commit in another
workspace. Use `<name>@<remote>` to refer to a remote-tracking bookmark.

A full commit ID refers to a single commit. A unique prefix of the full commit
ID can also be used. It is an error to use a non-unique prefix.

A full change ID refers to a visible commit with that change ID. A unique prefix
of the full change ID can also be used. It is an error to use a non-unique
prefix or [a divergent change ID](https://www.jj-vcs.dev/latest/glossary/index.html#divergent-change). To refer to a
[hidden](https://www.jj-vcs.dev/latest/revsets/index.html#hidden-revisions) commit or [divergent change](https://www.jj-vcs.dev/latest/glossary/index.html#divergent-change), a
[change offset](https://www.jj-vcs.dev/latest/glossary/index.html#change-offset) can be added using `<change ID>/<offset>` syntax.

Use [single or double quotes](https://www.jj-vcs.dev/latest/templates/index.html#stringliteral-type) to prevent a symbol from being
interpreted as an expression. For example, `"x-"` is the symbol `x-`, not the
parents of symbol `x`. Taking shell quoting into account, you may need to use
something like `jj log -r '"x-"'`.

### Priority[¶](https://www.jj-vcs.dev/latest/revsets/index.html#priority "Permanent link")

Jujutsu attempts to resolve a symbol in the following order:

1. Tag name
2. Bookmark name
3. Git ref
4. Commit ID or change ID

To override the priority, use the appropriate [revset function](https://www.jj-vcs.dev/latest/revsets/index.html#functions). For
example, to resolve `abc` as a commit ID even if there happens to be a bookmark
by the same name, use `commit_id(abc)`. This is particularly useful in scripts.

## Operators[¶](https://www.jj-vcs.dev/latest/revsets/index.html#operators "Permanent link")

The following operators are supported. `x` and `y` below can be any revset, not
only symbols.

* `x-`: Parents of `x`, can be empty.
* `x+`: Children of `x`, can be empty.
* `x::`: Descendants of `x`, including the commits in `x` itself. Equivalent to
  `x::visible_heads()` if no hidden revisions are mentioned.
* `x..`: Revisions that are not ancestors of `x`. Equivalent to `~::x`, and
  `x..visible_heads()` if no hidden revisions are mentioned.
* `::x`: Ancestors of `x`, including the commits in `x` itself. Shorthand for
  `root()::x`.
* `..x`: Ancestors of `x`, including the commits in `x` itself, but excluding
  the root commit. Shorthand for `root()..x`. Equivalent to `::x ~ root()`.
* `x::y`: Descendants of `x` that are also ancestors of `y`. Equivalent
  to `x:: & ::y`. This is what `git log` calls `--ancestry-path x..y`.
* `x..y`: Ancestors of `y` that are not also ancestors of `x`. Equivalent to
  `::y ~ ::x`. This is what `git log` calls `x..y` (i.e. the same as we call it).
* `::`: All visible commits in the repo. Equivalent to `all()`, and
  `root()::visible_heads()` if no hidden revisions are mentioned.
* `..`: All visible commits in the repo, but excluding the root commit.
  Equivalent to `~root()`, and `root()..visible_heads()` if no hidden revisions
  are mentioned.
* `~x`: Revisions that are not in `x`.
* `x & y`: Revisions that are in both `x` and `y`.
* `x ~ y`: Revisions that are in `x` but not in `y`.
* `x | y`: Revisions that are in either `x` or `y` (or both).

(listed in order of binding strengths)

You can use parentheses to control evaluation order, such as `(x & y) | z` or
`x & (y | z)`.

Examples

Given this history:

```
o D
|\
| o C
| |
o | B
|/
o A
|
o root()
```

**Operator** `x-`

* `D-` ⇒ `{C,B}`
* `B-` ⇒ `{A}`
* `A-` ⇒ `{root()}`
* `root()-` ⇒ `{}` (empty set)
* `none()-` ⇒ `{}` (empty set)
* `(D|A)-` ⇒ `{C,B,root()}`
* `(C|B)-` ⇒ `{A}`

**Operator** `x+`

* `D+` ⇒ `{}` (empty set)
* `B+` ⇒ `{D}`
* `A+` ⇒ `{B,C}`
* `root()+` ⇒ `{A}`
* `none()+` ⇒ `{}` (empty set)
* `(C|B)+` ⇒ `{D}`
* `(B|root())+` ⇒ `{D,A}`

**Operator** `x::`

* `D::` ⇒ `{D}`
* `B::` ⇒ `{D,B}`
* `A::` ⇒ `{D,C,B,A}`
* `root()::` ⇒ `{D,C,B,A,root()}`
* `none()::` ⇒ `{}` (empty set)
* `(C|B)::` ⇒ `{D,C,B}`

**Operator** `x..`

* `D..` ⇒ `{}` (empty set)
* `B..` ⇒ `{D,C}` (note that, unlike `B::`, this includes `C`)
* `A..` ⇒ `{D,C,B}`
* `root()..` ⇒ `{D,C,B,A}`
* `none()..` ⇒ `{D,C,B,A,root()}`
* `(C|B)..` ⇒ `{D}`

**Operator** `::x`

* `::D` ⇒ `{D,C,B,A,root()}`
* `::B` ⇒ `{B,A,root()}`
* `::A` ⇒ `{A,root()}`
* `::root()` ⇒ `{root()}`
* `::none()` ⇒ `{}` (empty set)
* `::(C|B)` ⇒ `{C,B,A,root()}`

**Operator** `..x`

* `..D` ⇒ `{D,C,B,A}`
* `..B` ⇒ `{B,A}`
* `..A` ⇒ `{A}`
* `..root()` ⇒ `{}` (empty set)
* `..none()` ⇒ `{}` (empty set)
* `..(C|B)` ⇒ `{C,B,A}`

**Operator** `x::y`

* `D::D` ⇒ `{D}`
* `B::D` ⇒ `{D,B}` (note that, unlike `B..D`, this includes `B` and excludes `C`)
* `B::C` ⇒ `{}` (empty set) (note that, unlike `B..C`, this excludes `C`)
* `A::D` ⇒ `{D,C,B,A}`
* `root()::D` ⇒ `{D,C,B,A,root()}`
* `none()::D` ⇒ `{}` (empty set)
* `D::B` ⇒ `{}` (empty set)
* `(C|B)::(C|B)` ⇒ `{C,B}`

**Operator** `x..y`

* `D..D` ⇒ `{}` (empty set)
* `B..D` ⇒ `{D,C}` (note that, unlike `B::D`, this includes `C` and excludes `B`)
* `B..C` ⇒ `{C}` (note that, unlike `B::C`, this includes `C`)
* `A..D` ⇒ `{D,C,B}`
* `root()..D` ⇒ `{D,C,B,A}`
* `none()..D` ⇒ `{D,C,B,A,root()}`
* `D..B` ⇒ `{}` (empty set)
* `(C|B)..(C|B)` ⇒ `{}` (empty set)

## Functions[¶](https://www.jj-vcs.dev/latest/revsets/index.html#functions "Permanent link")

You can also specify revisions by using functions. Some functions take other
revsets (expressions) as arguments.

Function argument syntax

In this documentation, optional arguments are indicated with square
brackets like `[arg]`. Some arguments also have an optional label which can
be used to specify that argument without specifying all previous arguments.

For instance, `remote_bookmarks([bookmark_pattern], [[remote=]remote_pattern])`
indicates that all of the following usages are valid:

* `remote_bookmarks()`
* `remote_bookmarks("main")`
* `remote_bookmarks("main", "origin")`
* `remote_bookmarks("main", remote="origin")`
* `remote_bookmarks(remote="origin")`

* `parents(x, [depth])`: `parents(x)` is the same as `x-`.
  `parents(x, depth)` returns the parents of `x` at the given `depth`. For
  instance, `parents(x, 3)` is equivalent to `x---`.
* `children(x, [depth])`: `children(x)` is the same as `x+`.
  `children(x, depth)` returns the children of `x` at the given `depth`. For
  instance, `children(x, 3)` is equivalent to `x+++`.
* `ancestors(x, [depth])`: `ancestors(x)` is the same as `::x`.
  `ancestors(x, depth)` returns the ancestors of `x` limited to the given
  `depth`.
* `descendants(x, [depth])`: `descendants(x)` is the same as `x::`.
  `descendants(x, depth)` returns the descendants of `x` limited to the given
  `depth`.
* `first_parent(x, [depth])`: `first_parent(x)` is similar to `parents(x)`, but
  for merges, it only returns the first parent instead of returning all parents.
  The `depth` argument also works similarly, so `first_parent(x, 2)` is
  equivalent to `first_parent(first_parent(x))`.
* `first_ancestors(x, [depth])`: Similar to `ancestors(x, [depth])`, but only
  traverses the first parent of each commit. In Git, the first parent of a merge
  commit is conventionally the branch into which changes are being merged, so
  `first_ancestors()` can be used to exclude changes made on other branches.
* `reachable(srcs, domain)`: All commits reachable from `srcs` within
  `domain`, traversing all parent and child edges. `srcs` outside `domain` are
  not considered even if a parent or child edge would reach into `domain`.
* `connected(x)`: Same as `x::x`. Useful when `x` includes several commits.
* `all()`: All visible commits and ancestors of commits explicitly mentioned.
* `none()`: No commits. This function is rarely useful; it is provided for
  completeness.
* `change_id(prefix)`: Commits with the given change ID prefix. If the specified
  change is divergent, this resolves to multiple commits. It is an error to use a
  non-unique prefix. Unmatched prefix isn't an error.
* `commit_id(prefix)`: Commits with the given commit ID prefix. It is an error
  to use a non-unique prefix. Unmatched prefix isn't an error.
* `bookmarks([pattern])`: All local bookmark targets. If `pattern` is specified,
  this selects the bookmarks whose name match the given [string
  pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns). For example, `bookmarks(push)` would match the
  bookmarks `push-123` and `repushed` but not the bookmark `main`. If a bookmark is
  in a conflicted state, all its possible targets are included.
* `remote_bookmarks([bookmark_pattern], [[remote=]remote_pattern])`: All remote
  bookmarks targets across all remotes. If just the `bookmark_pattern` is
  specified, the bookmarks whose names match the given [string
  pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns) across all remotes are selected. If both
  `bookmark_pattern` and `remote_pattern` are specified, the selection is
  further restricted to just the remotes whose names match `remote_pattern`.

  For example, `remote_bookmarks(push, ri)` would match the bookmarks
  `push-123@origin` and `repushed@private` but not `push-123@upstream` or
  `main@origin` or `main@upstream`. If a bookmark is in a conflicted state, all
  its possible targets are included.

  Git-tracking bookmarks are excluded by default. Use `remote="git"` or
  `remote="*"` to select bookmarks including `@git` ones.
* `tracked_remote_bookmarks([bookmark_pattern], [[remote=]remote_pattern])`: All
  targets of tracked remote bookmarks. Supports the same optional arguments as
  `remote_bookmarks()`.
* `untracked_remote_bookmarks([bookmark_pattern], [[remote=]remote_pattern])`:
  All targets of untracked remote bookmarks. Supports the same optional arguments
  as `remote_bookmarks()`.
* `tags([pattern])`: All tag targets. If `pattern` is specified,
  this selects the tags whose name match the given [string
  pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns). For example, `tags(v1)` would match the
  tags `v123` and `rev1` but not the tag `v2`. If a tag is
  in a conflicted state, all its possible targets are included.
* `visible_heads()`: All visible heads (same as `heads(all())` if no hidden
  revisions are mentioned).
* `root()`: The virtual commit that is the oldest ancestor of all other commits.
* `heads(x)`: Commits in `x` that are not ancestors of other commits in `x`.
  Equivalent to `x ~ ::x-`. Note that this is different from
  [Mercurial's](https://repo.mercurial-scm.org/hg/help/revsets) `heads(x)`
  function, which is equivalent to `x ~ x-`.
* `roots(x)`: Commits in `x` that are not descendants of other commits in `x`.
  Equivalent to `x ~ x+::`. Note that this is different from
  [Mercurial's](https://repo.mercurial-scm.org/hg/help/revsets) `roots(x)`
  function, which is equivalent to `x ~ x+`.
* `latest(x, [count])`: Latest `count` commits in `x`, based on committer
  timestamp. The default `count` is 1.
* `fork_point(x)`: The fork point of all commits in `x`. The fork point is the
  common ancestor(s) of all commits in `x` which do not have any descendants
  that are also common ancestors of all commits in `x`. It is equivalent to
  the revset `heads(::x_1 & ::x_2 & ... & ::x_N)`, where `x_{1..N}` are commits
  in `x`. If `x` resolves to a single commit, `fork_point(x)` resolves to `x`.
* `bisect(x)`: Finds commits in the input set for which about half of the input
  set are descendants. The current implementation deals somewhat poorly with
  non-linear history.
* `exactly(x, count)`: Evaluates `x`, and errors if it is not of exactly size
  `count`. Otherwise, returns `x`. This is useful in particular with `count=1`
  when you want to ensure that some revset expression has exactly one target.
* `merges()`: Merge commits.
* `description(pattern)`: Commits that have a description matching the given
  [string pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns).

  A non-empty description is usually terminated with newline character. For
  example, `description("")` matches commits without description, and
  `description("foo\n")` matches commits with description `"foo\n"`.
* `subject(pattern)`: Commits that have a subject matching the given [string
  pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns). A subject is the first line of the description
  (without newline character.)
* `author(pattern)`: Commits with the author's name or email matching the given
  [string pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns). Equivalent to `author_name(pattern) |
  author_email(pattern)`.
* `author_name(pattern)`: Commits with the author's name matching the given
  [string pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns).
* `author_email(pattern)`: Commits with the author's email matching the given
  [string pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns).
* `author_date(pattern)`: Commits with author dates matching the specified [date
  pattern](https://www.jj-vcs.dev/latest/revsets/index.html#date-patterns).
* `mine()`: Commits where the author's email matches the email of the current
  user. Equivalent to `author_email(exact-i:<user-email>)`
* `committer(pattern)`: Commits with the committer's name or email matching the
  given [string pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns). Equivalent to
  `committer_name(pattern) | committer_email(pattern)`.
* `committer_name(pattern)`: Commits with the committer's name matching the
  given [string pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns).
* `committer_email(pattern)`: Commits with the committer's email matching the
  given [string pattern](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns).
* `committer_date(pattern)`: Commits with committer dates matching the specified
  [date pattern](https://www.jj-vcs.dev/latest/revsets/index.html#date-patterns).
* `signed()`: Commits that are cryptographically signed.
* `empty()`: Commits modifying no files. This also includes `merges()` without
  user modifications and `root()`.
* `files(expression)`: Commits modifying paths matching the given [fileset
  expression](https://www.jj-vcs.dev/latest/filesets/index.html).

  Paths are relative to the directory `jj` was invoked from. A directory name
  will match all files in that directory and its subdirectories.

  For example, `files(foo)` will match files `foo`, `foo/bar`, `foo/bar/baz`.
  It will *not* match `foobar` or `bar/foo`.

  Some file patterns might need quoting because the `expression` must also be
  parsable as a revset. For example, `.` has to be quoted in `files(".")`.
* `diff_contains(text, [files])`: Commits containing diffs matching the given
  `text` pattern line by line.

  The search paths can be narrowed by the `files` expression. All modified files
  are scanned by default, but it is likely to change in future version to
  respect the command line path arguments.

  For example, `diff_contains("*TODO*", "src")` will search revisions where "TODO"
  is added to or removed from files under "src".
* `conflicts()`: Commits with conflicts.
* `present(x)`: Same as `x`, but evaluated to `none()` if any of the commits
  in `x` doesn't exist (e.g. is an unknown bookmark name.)
* `coalesce(revsets...)`: Commits in the first revset in the list of `revsets`
  which does not evaluate to `none()`. If all revsets evaluate to `none()`, then
  the result of `coalesce` will also be `none()`.
* `working_copies()`: The working copy commits across all the workspaces.
* `at_operation(op, x)`: Evaluates `x` at the specified [operation](https://www.jj-vcs.dev/latest/glossary/index.html#operation). For
  example, `at_operation(@-, visible_heads())` will return all heads which were
  visible at the previous operation.

  Since `at_operation(op, x)` brings all commits that were visible at the
  operation to the search space, `at_operation(op, x) | all()` is equivalent to
  `at_operation(op, x) | ::(at_operation(op, x | visible_heads()) |
  visible_heads())`.

Examples

Given this history:

```
o E
|
| o D
|/|
| o C
| |
o | B
|/
o A
|
o root()
```

**function** `reachable()`

* `reachable(E, A..)` ⇒ `{E,D,C,B}`
* `reachable(D, A..)` ⇒ `{E,D,C,B}`
* `reachable(C, A..)` ⇒ `{E,D,C,B}`
* `reachable(B, A..)` ⇒ `{E,D,C,B}`
* `reachable(A, A..)` ⇒ `{}` (empty set)

**function** `connected()`

* `connected(E|A)` ⇒ `{E,B,A}`
* `connected(D|A)` ⇒ `{D,C,B,A}`
* `connected(A)` ⇒ `{A}`

**function** `heads()`

* `heads(E|D)` ⇒ `{E,D}`
* `heads(E|C)` ⇒ `{E,C}`
* `heads(E|B)` ⇒ `{E}`
* `heads(E|A)` ⇒ `{E}`
* `heads(A)` ⇒ `{A}`

**function** `roots()`

* `roots(E|D)` ⇒ `{E,D}`
* `roots(E|C)` ⇒ `{E,C}`
* `roots(E|B)` ⇒ `{B}`
* `roots(E|A)` ⇒ `{A}`
* `roots(A)` ⇒ `{A}`

**function** `fork_point()`

* `fork_point(E|D)` ⇒ `{B}`
* `fork_point(E|C)` ⇒ `{A}`
* `fork_point(E|B)` ⇒ `{B}`
* `fork_point(E|A)` ⇒ `{A}`
* `fork_point(D|C)` ⇒ `{C}`
* `fork_point(D|B)` ⇒ `{B}`
* `fork_point(B|C)` ⇒ `{A}`
* `fork_point(A)` ⇒ `{A}`
* `fork_point(none())` ⇒ `{}`

## String patterns[¶](https://www.jj-vcs.dev/latest/revsets/index.html#string-patterns "Permanent link")

Functions that perform string matching support the following pattern syntax (the
quotes are optional).

By default, `"string"` is parsed as a `glob:` pattern.

* `exact:"string"`: Matches strings exactly equal to `string`.
* `glob:"pattern"`: Matches strings with Unix-style shell [wildcard
  `pattern`](https://docs.rs/globset/latest/globset/#syntax).
* `regex:"pattern"`: Matches substrings with [regular
  expression `pattern`](https://docs.rs/regex/latest/regex/#syntax).
* `substring:"string"`: Matches strings that contain `string`.

You can append `-i` after the kind to match case‐insensitively (e.g.
`glob-i:"fix*jpeg*"`).

String patterns can be combined by using logical operators
(e.g. `bookmarks(~glob:"ci/*")`):

* `~x`: Matches everything but `x`.
* `x & y`: Matches both `x` and `y`.
* `x ~ y`: Matches `x` but not `y`.
* `x | y`: Matches either `x` or `y` (or both).

## Date patterns[¶](https://www.jj-vcs.dev/latest/revsets/index.html#date-patterns "Permanent link")

Functions that perform date matching support the following pattern syntax:

* `after:"string"`: Matches dates exactly at or after the given date.
* `before:"string"`: Matches dates before, but not including, the given date.

Date strings can be specified in several forms, including:

* 2024-02-01
* 2024-02-01T12:00:00
* 2024-02-01T12:00:00-08:00
* 2024-02-01 12:00:00
* 2 days ago
* 5 minutes ago
* yesterday
* yesterday 5pm
* yesterday 10:30
* yesterday 15:30

## Aliases[¶](https://www.jj-vcs.dev/latest/revsets/index.html#aliases "Permanent link")

New symbols and functions can be defined in the config file, by using any
combination of the predefined symbols/functions and other aliases.

Alias functions can be overloaded by the number of parameters. However, builtin
function will be shadowed by name, and can't co-exist with aliases.

For example:

```
[revset-aliases]
'HEAD' = '@-'
'user()' = 'user("me@example.org")'
'user(x)' = 'author(x) | committer(x)'
```

### Built-in Aliases[¶](https://www.jj-vcs.dev/latest/revsets/index.html#built-in-aliases "Permanent link")

The following aliases are built-in and used for certain operations. These functions
are defined as aliases in order to allow you to overwrite them as needed.
See [revsets.toml](https://github.com/jj-vcs/jj/blob/main/cli/src/config/revsets.toml)
for a comprehensive list.

* `trunk()`: Resolves to the head commit for the default bookmark of the default
  remote, or the remote named `upstream` or `origin`. This is set at the
  repository level upon initialization of a Jujutsu repository.

  If the default bookmark cannot be resolved during initialization, the default
  global configuration tries the bookmarks `main`, `master`, and `trunk` on the
  `upstream` and `origin` remotes. If more than one potential trunk commit
  exists, the newest one is chosen. If none of the bookmarks exist, the revset
  evaluates to `root()`.

  You can [override](https://www.jj-vcs.dev/latest/config/index.html) this as appropriate. If you do, make sure it
  always resolves to exactly one commit. For example:

  ```
  [revset-aliases]
  'trunk()' = 'your-bookmark@your-remote'
  ```
* `builtin_immutable_heads()`: Resolves to
  `present(trunk()) | tags() | untracked_remote_bookmarks()`. It is used as the
  default definition for `immutable_heads()` below. It is not recommended to
  redefine this alias. Prefer to redefine `immutable_heads()` instead.
* `immutable_heads()`: Resolves to
  `present(trunk()) | tags() | untracked_remote_bookmarks()` by default. It is
  actually defined as `builtin_immutable_heads()`, and can be overridden as
  required. See [here](https://www.jj-vcs.dev/latest/config/index.html#set-of-immutable-commits) for details.
* `immutable()`: The set of commits that `jj` treats as immutable. This is
  equivalent to `::(immutable_heads() | root())`. It is not recommended to redefine
  this alias. Note that modifying this will *not* change whether a commit is immutable.
  To do that, edit `immutable_heads()`.
* `mutable()`: The set of commits that `jj` treats as mutable. This is
  equivalent to `~immutable()`. It is not recommended to redefined this alias.
  Note that modifying this will *not* change whether a commit is immutable.
  To do that, edit `immutable_heads()`.
* `visible()`: The set of visible commits. Resolves to `::visible_heads()`.
  This is equal to `all()` unless your revset includes
  [hidden revisions](https://www.jj-vcs.dev/latest/revsets/index.html#hidden-revisions).
* `hidden()`: The set of hidden commits. Resolves to `~visible()`. This is empty
  unless your revset includes [hidden revisions](https://www.jj-vcs.dev/latest/revsets/index.html#hidden-revisions). Note that
  this is *not* [the set of all previously visible
  commits](https://github.com/jj-vcs/jj/issues/2623).

## Examples[¶](https://www.jj-vcs.dev/latest/revsets/index.html#examples "Permanent link")

Show the parent(s) of the working-copy commit (like `git log -1 HEAD`):

```
jj log -r @-
```

Show all ancestors of the working copy (like plain `git log`)

```
jj log -r ::@
```

Show commits not on any remote bookmark:

```
jj log -r 'remote_bookmarks()..'
```

Show commits not on `origin` (if you have other remotes like `fork`):

```
jj log -r 'remote_bookmarks(remote=origin)..'
```

Show the initial commits in the repo (the ones Git calls "root commits"):

```
jj log -r 'root()+'
```

Show some important commits (like `git log --simplify-by-decoration`):

```
jj log -r 'tags() | bookmarks()'
```

Show local commits leading up to the working copy, as well as descendants of
those commits:

```
jj log -r '(remote_bookmarks()..@)::'
```

Show commits authored by "martinvonz" and containing the word "reset" in the
description:

```
jj log -r 'author(*martinvonz*) & description(*reset*)'
```
