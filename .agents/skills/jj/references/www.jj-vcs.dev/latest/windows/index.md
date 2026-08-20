---
title: "Working on Windows - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/windows/index"
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
  + Working on Windows

    [Working on Windows](https://www.jj-vcs.dev/latest/windows/index.html)

    Table of contents
    - [Line endings conversion](https://www.jj-vcs.dev/latest/windows/index.html#line-endings-conversion)
    - [Pagination](https://www.jj-vcs.dev/latest/windows/index.html#pagination)
    - [Typing @ in PowerShell](https://www.jj-vcs.dev/latest/windows/index.html#typing-in-powershell)
    - [WSL sets the execute bit on all files](https://www.jj-vcs.dev/latest/windows/index.html#wsl-sets-the-execute-bit-on-all-files)
    - [Symbolic link support](https://www.jj-vcs.dev/latest/windows/index.html#symbolic-link-support)
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

* [Line endings conversion](https://www.jj-vcs.dev/latest/windows/index.html#line-endings-conversion)
* [Pagination](https://www.jj-vcs.dev/latest/windows/index.html#pagination)
* [Typing @ in PowerShell](https://www.jj-vcs.dev/latest/windows/index.html#typing-in-powershell)
* [WSL sets the execute bit on all files](https://www.jj-vcs.dev/latest/windows/index.html#wsl-sets-the-execute-bit-on-all-files)
* [Symbolic link support](https://www.jj-vcs.dev/latest/windows/index.html#symbolic-link-support)

# Working on Windows[¶](https://www.jj-vcs.dev/latest/windows/index.html#working-on-windows "Permanent link")

Jujutsu works the same on all platforms, but there are some caveats that Windows
users should be aware of.

## Line endings conversion[¶](https://www.jj-vcs.dev/latest/windows/index.html#line-endings-conversion "Permanent link")

Jujutsu currently has a setting,
[`working-copy.eol-conversion`](https://www.jj-vcs.dev/latest/config/index.html#eol-conversion-settings), similar to
Git's [`core.autocrlf`](https://git-scm.com/book/en/v2/Customizing-Git-Git-Configuration#_core_autocrlf)[1](https://www.jj-vcs.dev/latest/windows/index.html#fn:1), but does not currently honor
`.gitattributes` and the `core.autocrlf` git config, so it is recommended to
keep the `working-copy.eol-conversion` setting and the `core.autocrlf` git
config in sync[1](https://www.jj-vcs.dev/latest/windows/index.html#fn:1).

Note

If you created a colocated git workspace, forget to keep these 2 settings in
sync, and result in a dirty working copy with only EOL diffs, you can set
the `working-copy.eol-conversion` setting correctly and run `jj abandon` to
fix it.

The line endings conversion won't be applied to files detected as a binary files
via a heuristics[2](https://www.jj-vcs.dev/latest/windows/index.html#fn:2) regardless of the settings. This behavior is subject to
change when we support the text git attribute.

Jujutsu may make incorrect decision on whether a file is a binary file and apply
line conversion incorrectly, but currently, Jujutsu doesn't support configuring
line endings conversion for particular files. If this issue is hit, one should
not enable the line conversion setting.

Note

If Jujutsu applies line endings conversion on incorrect files, you should
not enable the line conversion setting and the git `core.autocrlf` setting.
See below.

To disable line conversion, set the `core.autocrlf` setting to `none` or just
remove the setting.

```
PS> git config core.autocrlf input
# We use none instead of input to avoid applying EOL conversion.
PS> jj config set --repo working-copy.eol-conversion none
# Abandoning the working copy will cause Jujutsu to overwrite all files with
# CRLF line endings with the line endings they are committed with, probably LF
PS> jj abandon
```

This means that line endings will be checked out exactly as they are committed
and committed exactly as authored.

This setting ensures Git will check out files with LF line endings without
converting them to CRLF. You'll want to make sure any tooling you use,
especially IDEs, preserve LF line endings.

## Pagination[¶](https://www.jj-vcs.dev/latest/windows/index.html#pagination "Permanent link")

On Windows, `jj` will use its integrated pager called `streampager` by default,
unless the config `ui.pager` is explicitly set. See the [pager section of the
config docs](https://www.jj-vcs.dev/latest/config/index.html#pager) for more details.

If the built-in pager doesn't meet your needs and you have Git installed, you
can switch to using Git's pager as follows:

```
PS> jj config set --user ui.pager '["C:\\Program Files\\Git\\usr\\bin\\less.exe", "-FRX"]'
PS> jj config set --user ui.paginate auto
```

## Typing `@` in PowerShell[¶](https://www.jj-vcs.dev/latest/windows/index.html#typing-in-powershell "Permanent link")

PowerShell uses `@` as part the [array sub-expression operator](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_arrays?view=powershell-7.4#the-array-sub-expression-operator), so it
often needs to be escaped or quoted in commands:

```
PS> jj log -r `@
PS> jj log -r '@'
```

One solution is to create a revset alias. For example, to make `HEAD` an alias
for `@`:

```
PS> jj config set --user revset-aliases.HEAD '@'
PS> jj log -r HEAD
```

## WSL sets the execute bit on all files[¶](https://www.jj-vcs.dev/latest/windows/index.html#wsl-sets-the-execute-bit-on-all-files "Permanent link")

When viewing a Windows drive from WSL (via */mnt/c* or a similar path), Windows
exposes all files with the execute bit set. Since Jujutsu automatically records
changes to the working copy, this sets the execute bit on all files committed in
your repository.

If you only need to access the repository in WSL, the best solution is to clone
the repository in the Linux file system (for example, in
`~/my-repo`).

If you need to use the repository in both WSL and Windows, one solution is to
create a workspace in the Linux file system:

```
PS> jj workspace add --name wsl ~/my-repo
```

Then only use the `~/my-repo` workspace from Linux.

## Symbolic link support[¶](https://www.jj-vcs.dev/latest/windows/index.html#symbolic-link-support "Permanent link")

`jj` supports symlinks on Windows only when they are enabled by the operating
system. This requires Windows 10 version 14972 or higher, as well as Developer
Mode. If those conditions are not satisfied, `jj` will materialize symlinks as
ordinary files.

For colocated workspaces, Git support must also be enabled using the
`git config` option `core.symlinks=true`.

---

1. This poses the question if we should support reading the `core.autocrlf`
   setting in colocated workspaces. See details at the
   [issue](https://github.com/jj-vcs/jj/issues/4048). [↩](https://www.jj-vcs.dev/latest/windows/index.html#fnref:1 "Jump back to footnote 1 in the text")[↩](https://www.jj-vcs.dev/latest/windows/index.html#fnref2:1 "Jump back to footnote 1 in the text")
2. To detect if a file is binary, Jujutsu currently checks if there is 0 byte
   in the file which is different from the algorithm of
   [`gitoxide`](https://github.com/GitoxideLabs/gitoxide/blob/073487b38ed40bcd7eb45dc110ae1ce84f9275a9/gix-filter/src/eol/utils.rs#L98-L100) or [`git`](https://github.com/git/git/blob/f1ca98f609f9a730b9accf24e5558a10a0b41b6c/convert.c#L94-L103). Jujutsu
   doesn't plan to align the binary detection logic with git. [↩](https://www.jj-vcs.dev/latest/windows/index.html#fnref:2 "Jump back to footnote 2 in the text")
