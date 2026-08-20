---
title: "Secure config - Jujutsu docs"
source_url: "https://www.jj-vcs.dev/latest/design/secure-config/index"
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
  + Secure config

    [Secure config](https://www.jj-vcs.dev/latest/design/secure-config/index.html)

    Table of contents
    - [The problem](https://www.jj-vcs.dev/latest/design/secure-config/index.html#the-problem)

      * [Threat model](https://www.jj-vcs.dev/latest/design/secure-config/index.html#threat-model)

        + [Attack vector 1: No-knowledge attacker](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-1-no-knowledge-attacker)
        + [Attack vector 2: Basic replay attack](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-2-basic-replay-attack)
        + [Attack vector 3: Replay attack with social engineering to preserve paths](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-3-replay-attack-with-social-engineering-to-preserve-paths)
        + [Attack vector 4: Extremely advanced replay attack with insecure code](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-4-extremely-advanced-replay-attack-with-insecure-code)
    - [Objective](https://www.jj-vcs.dev/latest/design/secure-config/index.html#objective)

      * [Goals](https://www.jj-vcs.dev/latest/design/secure-config/index.html#goals)
      * [Non-goals (Optional)](https://www.jj-vcs.dev/latest/design/secure-config/index.html#non-goals-optional)
    - [Detailed Design](https://www.jj-vcs.dev/latest/design/secure-config/index.html#detailed-design)

      * [Storing config out-of-repo](https://www.jj-vcs.dev/latest/design/secure-config/index.html#storing-config-out-of-repo)

        + [Happy path](https://www.jj-vcs.dev/latest/design/secure-config/index.html#happy-path)
        + [No config-ID file](https://www.jj-vcs.dev/latest/design/secure-config/index.html#no-config-id-file)

          - [Without config files](https://www.jj-vcs.dev/latest/design/secure-config/index.html#without-config-files)
          - [With config files](https://www.jj-vcs.dev/latest/design/secure-config/index.html#with-config-files)
        + [No config directory for the config-ID](https://www.jj-vcs.dev/latest/design/secure-config/index.html#no-config-directory-for-the-config-id)
        + [Distinguishing copies from moves](https://www.jj-vcs.dev/latest/design/secure-config/index.html#distinguishing-copies-from-moves)
      * [Garbage collection](https://www.jj-vcs.dev/latest/design/secure-config/index.html#garbage-collection)
      * [Attack vectors remaining](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vectors-remaining)
      * [UX issues](https://www.jj-vcs.dev/latest/design/secure-config/index.html#ux-issues)
    - [Alternatives considered](https://www.jj-vcs.dev/latest/design/secure-config/index.html#alternatives-considered)

      * [Store the configs in-repo with an untamperable cryptographic signature](https://www.jj-vcs.dev/latest/design/secure-config/index.html#store-the-configs-in-repo-with-an-untamperable-cryptographic-signature)

        + [Do we include paths in the signature?](https://www.jj-vcs.dev/latest/design/secure-config/index.html#do-we-include-paths-in-the-signature)
        + [How to sign the content of the repo config?](https://www.jj-vcs.dev/latest/design/secure-config/index.html#how-to-sign-the-content-of-the-repo-config)
* [Development roadmap](https://www.jj-vcs.dev/latest/roadmap/index.html)
* [Changelog](https://www.jj-vcs.dev/latest/changelog/index.html)

Table of contents

* [The problem](https://www.jj-vcs.dev/latest/design/secure-config/index.html#the-problem)

  + [Threat model](https://www.jj-vcs.dev/latest/design/secure-config/index.html#threat-model)

    - [Attack vector 1: No-knowledge attacker](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-1-no-knowledge-attacker)
    - [Attack vector 2: Basic replay attack](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-2-basic-replay-attack)
    - [Attack vector 3: Replay attack with social engineering to preserve paths](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-3-replay-attack-with-social-engineering-to-preserve-paths)
    - [Attack vector 4: Extremely advanced replay attack with insecure code](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-4-extremely-advanced-replay-attack-with-insecure-code)
* [Objective](https://www.jj-vcs.dev/latest/design/secure-config/index.html#objective)

  + [Goals](https://www.jj-vcs.dev/latest/design/secure-config/index.html#goals)
  + [Non-goals (Optional)](https://www.jj-vcs.dev/latest/design/secure-config/index.html#non-goals-optional)
* [Detailed Design](https://www.jj-vcs.dev/latest/design/secure-config/index.html#detailed-design)

  + [Storing config out-of-repo](https://www.jj-vcs.dev/latest/design/secure-config/index.html#storing-config-out-of-repo)

    - [Happy path](https://www.jj-vcs.dev/latest/design/secure-config/index.html#happy-path)
    - [No config-ID file](https://www.jj-vcs.dev/latest/design/secure-config/index.html#no-config-id-file)

      * [Without config files](https://www.jj-vcs.dev/latest/design/secure-config/index.html#without-config-files)
      * [With config files](https://www.jj-vcs.dev/latest/design/secure-config/index.html#with-config-files)
    - [No config directory for the config-ID](https://www.jj-vcs.dev/latest/design/secure-config/index.html#no-config-directory-for-the-config-id)
    - [Distinguishing copies from moves](https://www.jj-vcs.dev/latest/design/secure-config/index.html#distinguishing-copies-from-moves)
  + [Garbage collection](https://www.jj-vcs.dev/latest/design/secure-config/index.html#garbage-collection)
  + [Attack vectors remaining](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vectors-remaining)
  + [UX issues](https://www.jj-vcs.dev/latest/design/secure-config/index.html#ux-issues)
* [Alternatives considered](https://www.jj-vcs.dev/latest/design/secure-config/index.html#alternatives-considered)

  + [Store the configs in-repo with an untamperable cryptographic signature](https://www.jj-vcs.dev/latest/design/secure-config/index.html#store-the-configs-in-repo-with-an-untamperable-cryptographic-signature)

    - [Do we include paths in the signature?](https://www.jj-vcs.dev/latest/design/secure-config/index.html#do-we-include-paths-in-the-signature)
    - [How to sign the content of the repo config?](https://www.jj-vcs.dev/latest/design/secure-config/index.html#how-to-sign-the-content-of-the-repo-config)

# Secure JJ config[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#secure-jj-config "Permanent link")

Author: [Matt Stark](mailto:msta@google.com)

## The problem[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#the-problem "Permanent link")

An attacker that has control over your jj configuration has full control over
your system when you run specific commands. As an example, an attacker can have
you enable the following repo config:

```
[fix.tools.foo]
command = ["malicious", "command"]
```

When a user then runs `jj fix`, this will run their malicious command and they
can gain full control over your system. This can be achieved via zipping up a
repo and sending it to the user, with the `.jj/repo/config.toml` file containing
the above config (hence why this is colloquially known as the “zip file
problem”).

There are plans to add features such as hooks to jj which will only make it
easier for this to occur. For simplicity’s sake, we will assume that if an
attacker has their configuration enabled on your system, it is compromised.

Assume any reference to repo config can equivalently be replaced with workspace
configs. We will treat them in the same way.

### Threat model[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#threat-model "Permanent link")

This is not something that can be 100% defended against. Defense against all
possible attack vectors is infeasible, so we will instead note all the attack
vectors and what it would take to defend against them.

#### Attack vector 1: No-knowledge attacker[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-1-no-knowledge-attacker "Permanent link")

1. The attacker creates a repo
2. The attacker runs
   `jj config set --repo fix.tools.foo ‘[“malicious”, “command”]’`
3. The attacker zips up their repo and sends it to the victim
4. The victim unzips the repo, make some changes, then run `jj fix`
5. They have now executed an arbitrary command on the victim’s system

This attack vector can be solved by ensuring that we can determine the user who
created the repo.

#### Attack vector 2: Basic replay attack[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-2-basic-replay-attack "Permanent link")

1. The victim uploads a zip file of a repository they have locally on their
   system
2. The attacker can now see stored in the repository
3. The attacker runs
   `jj config set --repo fix.tools.foo ‘[“malicious”, “command”]’`
4. The attacker copies the victim’s cryptographic signature and puts it in
   their malicious repository.
5. The attacker zips up their repo and sends it to the victim
6. The victim unzips the repo at an arbitrary location, make some changes, then
   run `jj fix`
7. They have now executed an arbitrary command on the victim’s system

This attack vector can be solved by ensuring that we can determine the path that
the repo was stored at.

#### Attack vector 3: Replay attack with social engineering to preserve paths[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-3-replay-attack-with-social-engineering-to-preserve-paths "Permanent link")

1. The victim uploads a zip file of a repository they have locally on their
   system at `/path/to/repo`
2. The attacker can now see any cryptographic signatures stored in the
   repository
3. The attacker runs
   `jj config set --repo fix.tools.foo ‘[“malicious”, “command”]’`
4. The attacker copies the victim’s cryptographic signature and puts it in
   their malicious repository.
5. The attacker zips up their repo, sends it to the victim, and instructs them
   to install it at `/path/to/repo`
6. The victim unzips the repo at `/path/to/repo`, make some changes, then run
   `jj fix`
7. They have now executed an arbitrary command on the victim’s system

This attack vector can be solved by making repository configuration
untamperable.

#### Attack vector 4: Extremely advanced replay attack with insecure code[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vector-4-extremely-advanced-replay-attack-with-insecure-code "Permanent link")

1. The victim creates a repo
2. The victim runs `jj config set --repo fix.tools.foo = [“$repo/format.py”]`
3. The victim uploads a zip file of a repository they have locally on their
   system at `/path/to/repo`
4. The attacker can now see any cryptographic signatures stored in the
   repository
5. The attacker modifies `format.py` to be malicious
6. The attacker zips up their repo and sends it to the victim
7. The victim runs `jj fix`
8. They have now executed an arbitrary command on the victim’s system

This attack vector cannot feasibly be dealt with. It would require a signature
of the transitive closure of files that can be accessed via jj configs to solve.

## Objective[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#objective "Permanent link")

### Goals[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#goals "Permanent link")

* Prevent as many of the above attack vectors as possible
* Have minimal negative impacts on UX

### Non-goals (Optional)[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#non-goals-optional "Permanent link")

* Use strategies such as sandboxing to mitigate damage
  \* We could do this for formatters, for example, but then repo hooks would
  have the same problem
  \* These options are not mutually exclusive

## Detailed Design[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#detailed-design "Permanent link")

Note that this design uses the word "repo" for everything, but we will use
precisely the same technique for workspace configs.

### Storing config out-of-repo[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#storing-config-out-of-repo "Permanent link")

We start by creating the concept of a "config ID".

* A config ID is a randomly generated ID used to identify a configuration.
* It should be stored in the repo
* It should uniquely identify a single repository / workspace

For clarity's sake, we will call these "config IDs" for repos, and "workspace
config IDs" for workspaces.

We will store per-repo configuration in
`etcetera::BaseStrategy::config_dir().join(“jj”).join(“repos”).join(config_id)`.

The filesystem structure will look like:

```
$HOME/.config/jj/
  repos/
    abc123/
      metadata.binpb
      config.toml
  workspaces/
    def456/
      config.toml
      metadata.binpb
my-repo/.jj/
  workspace-config-id (contains "def456")
  workspace-config.toml (unused by jj, details below)
  repo/
    config-id (contains "abc123")
    config.toml (unused by jj, details below)
```

`metadata.binpb` will refer to the following protobuf:

```
message Metadata {
  // This is used to distinguish between copies and moves.
  string path = 1;
}
```

The function to load repository configuration, will roughly speaking, look like:

```
enum ConfigLoadError { NoRepoId, NoConfig, PathMismatch, }

fn load_repo_config_path(repo: &Path) -> Result<PathBuf, ConfigLoadError> {
  let config_id = std::fs::read_to_string(repo.join("config-id"))
    .map_err(|_|Err(NoRepoId))?;
  let repo_config_dir = config_dir.join("repos").join(config_id);
  let metadata = Metadata::decode(
    std::fs::read(repo_config_dir.join("metadata.binpb")) .map_err(|_|
    Err(NoConfig))? )?;
  if metadata.path != repo {
    return Err(PathMismatch)
  }
  Ok(repo_config_dir.join("config.toml"))
}
```

#### Happy path[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#happy-path "Permanent link")

Normally we will simply:

1. Load the `config-id` file
2. Check that `$HOME/.config/jj/repos/$CONFIG_ID` exists
3. Validate that the path in `$HOME/.config/jj/repos/$CONFIG_ID/metadata.binpb`
   matches the repo's path
4. Find the corresponding config in
   `$HOME/.config/jj/repos/$CONFIG_ID/config.toml`
5. Load that config.

However, these steps can fail. The following sections are how we will handle
the errors.

#### No config-ID file[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#no-config-id-file "Permanent link")

##### Without config files[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#without-config-files "Permanent link")

If `$repo/.jj/repo/config.toml` does not exist, the repo doesn't have any config,
and thus requires no config ID.

Note that the expected way to generate a config-ID would be for the user to either
run `jj config edit` or `jj config path`.

##### With config files[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#with-config-files "Permanent link")

If the config file exists, then this corresponds to a legacy repo. To preserve
backwards compatibility, we will introduce a period of auto-migration. The
current plan is 12 jj versions (approximately 1 year). During this period, if a
config ID has not yet been generated, we will silently perform the following
(order matters, to ensure failure halfway through doesn’t affect things):

1. Generate a config ID `abc123`
2. Create `$HOME/.config/jj/repo/abc123/metadata.binpb`
3. Create `$HOME/.config/jj/repo/abc123/config.toml` as a copy of the original
   config file
4. Atomically generate a `config-id` file containing `abc123`
5. Remove the original config file
6. For the user's convenience, and for older version of jj, we:
   \* Try to symlink the old config to the new config
   \* If this fails (symlinks don't play nice on windows), we replace it with
   the same file content, with an extra comment at the top telling the user
   not to edit the file, and set it to readonly.

After the migration period is over, we will:

* Stop the auto-migration
* If the config file was previously created by auto-migration, delete it
  + `zip` follows symlinks by default, so this would reveal the content of your
    config to an attacker if they convinced you to send them your repo.
* If the config file exists, print a warning that the config file has been ignored.

#### No config directory for the config-ID[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#no-config-directory-for-the-config-id "Permanent link")

This could occur, for example, if the user created a repository in linux,
rebooted into windows on the same computer, and attempted to access that repo.

In this event, the user probably expects their config to be attached to the
repository, and they expect it to still work on linux, so we will:

* Create a new `$HOME/.config/jj/repo/$CONFIG_ID` directory for the same config
  ID (to ensure that the config still works on windows)
* Print a warning that if there was any per-repo configuration, it is no longer
  available.

#### Distinguishing copies from moves[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#distinguishing-copies-from-moves "Permanent link")

A user's expectation is that if they run `cp -r old_repo new_repo`, then modify
the old repo's config, the new repo's config is not affected. Thus, we need to
make sure that the repo remains in a 1:1 relationship with the config. Multiple
repos should not point to the same config.

To achieve this, we point the repo at the config, and the config back at the
repo. If the path stored in the config doesn't match, we know that something has
happened. To decide precisely what happened:

* If the path stored in the config no longer exists, we assume it's a move
  + We update `metadata.path` to point to the new path
* Otherwise, we attempt to write to a temporary file in `$NEW_REPO/.jj/repo`.
  + If it shows up in the original repository, it's some kind of reference
    (link, mount, etc.), so we don't do anything.
  + Otherwise, it's a copy, so we generate a new config ID and copy the old
    config to it

Note that with a copy, we only actually copy the config when the user runs a
`jj` command. This means that you can end up in a situation where you:

1. `cp -r old_repo new_repo`
2. In `old_repo`, `jj config set --repo`
3. Run a jj command in the copy. This copies the config, including the config
   from step 2.

However, this is inherent to storing config out of the repo and is thus
unavoidable.

### Garbage collection[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#garbage-collection "Permanent link")

We could, in the future, add a `gc` command to garbage-collect configs to
deleted repo configs. However, there are some things to consider before doing
so:

* Each config would likely be very small, so cleaning it up may have limited
  benefit.
* It is impossible to distinguish "deleted" from "moved".
* If you have something like a chroot or a dual boot where you share the
  config, you may have references to config IDs with a different path.

### Attack vectors remaining[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#attack-vectors-remaining "Permanent link")

Unfortunately, there is no way to distinguish copying / moving from a replay
attack. The attacker, if they know a config ID that exists on your system, can
create a repo with the same config ID. However, the fact that the config itself is
stored out of repo inherently prevents simple replay attacks. In order for the
attacker to exploit this, they would need to:

* Know your config ID (requires uploading a zip file or something similar)
* Get lucky by the victim having a “risky” per-repo config
* Eg. fix.tools pointing to `$repo/formatter`
* Know how to exploit it
* Because your config file is stored out-of-repo, the attacker will likely not
  know any of this without some social engineering

Given the impossibility of distinguishing copying / moving from a replay attack,
any security measures we come up with to deal with this would have false positives
whenever you do a copy / move, creating a significant UX cost. Thus, we
intentionally choose not to deal with this kind of attack in the initial
version, and have no current intention to solve it in future versions either.

We could potentially deal with this attack vector as an opt-in feature in the
future, but it has dubious benefit, as the kind of user who would opt in to
something like this is also the kind of user who would never upload their repo
as a zip file.

Because only the config-id is stored in-repo, the only attack vector remaining
is the replay attack I mentioned above.

### UX issues[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#ux-issues "Permanent link")

* Copying the repo is essentially a symlink to an old config until you update
  it
* Multiple users on the same system would each have different per-repo configs
  \* This can be solved by simply symlinking `$HOME/.config/jj` to
  `%APPDATA%/jj` (or vice versa) to solve this issue. You were probably
  doing this anyway with specifically the user config file instead of the
  directory.
* The repo config will no longer be available across machines if the user is
  using something like a distributed file system. This is probably OK, since
  if the user has a complex setup like this, they will also have issues with
  the config of every other application not being shared, and could easily
  solve this by sharing `~/.config`.

## Alternatives considered[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#alternatives-considered "Permanent link")

### Store the configs in-repo with an untamperable cryptographic signature[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#store-the-configs-in-repo-with-an-untamperable-cryptographic-signature "Permanent link")

There are a few questions we would need to resolve here, all with significant
drawbacks:

##### Do we include paths in the signature?[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#do-we-include-paths-in-the-signature "Permanent link")

If we do, we introduce a whole bunch of additional annoying UX to the user when
they move repos around.

If we don't, we leave ourselved exposed to additional attack vectors

##### How to sign the content of the repo config?[¶](https://www.jj-vcs.dev/latest/design/secure-config/index.html#how-to-sign-the-content-of-the-repo-config "Permanent link")

* We could not sign it at all, but that would leave ourselves exposed to
  additional attack vectors.
* We could sign the content of the repo config, but then when the user
  manually edits the file we have additional UX we need to introduce.
* We could store both the content and the signature in the repo protobuf, but
  the config would no longer exist on disk as a regular file, and thus you
  couldn't use standard tools to read and write the config.

All of these options were discussed in the original PR (#7761), which, unlike
the current approach, introduced user interventions and a review process. The
current approach, on the other hand, while it does have some extremely minor UX
weirdness, has no such issues.
