#!/usr/bin/env bash
# Collect a secret-safe patch without ever writing an unsanitized full patch.
# Usage: collect_sanitized_patch.sh --repo ROOT --out DIR
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FILTER="$SCRIPT_DIR/filter_secret_paths.ts"
PRIVATE_KEY_HEADER_RE='-----BEGIN (ENCRYPTED |RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'
JJ_STATUS_TEMPLATE='self.status() ++ "\t" ++ self.source().path() ++ "\t" ++ self.target().path() ++ "\n"'

die() {
	printf '%s\n' "$1" >&2
	exit "${2:-1}"
}

usage() {
	printf 'Usage: collect_sanitized_patch.sh --repo ROOT --out DIR\n' >&2
	exit 1
}

repo=''
out=''

while (($# > 0)); do
	case "$1" in
	--repo)
		shift
		[[ $# -gt 0 ]] || usage
		repo=$1
		;;
	--out)
		shift
		[[ $# -gt 0 ]] || usage
		out=$1
		;;
	-h | --help)
		usage
		;;
	*)
		die "unknown argument: $1"
		;;
	esac
	shift
done

[[ -n "$repo" ]] || die "missing required argument: --repo"
[[ -n "$out" ]] || die "missing required argument: --out"
[[ -d "$repo" ]] || die "repository not found: $repo"

repo=$(realpath "$repo")
mkdir -p "$out"
out=$(realpath "$out")

status_file=$(mktemp)
trap 'rm -f "$status_file"' EXIT

if [[ -d "$repo/.jj" ]]; then
	vcs=jj
	format=jj
	if ! command -v jj >/dev/null 2>&1; then
		die "jj is required for a jj repository"
	fi
	jj -R "$repo" --color=never diff -T "$JJ_STATUS_TEMPLATE" >"$status_file"
else
	vcs=git
	format=git
	if ! command -v git >/dev/null 2>&1; then
		die "git is required for a git repository"
	fi
	git -C "$repo" --no-pager -c core.quotePath=false diff --name-status -z -M --no-color HEAD >"$status_file"
fi

if ! command -v deno >/dev/null 2>&1; then
	die "deno is required to classify secret paths"
fi

deno run --allow-read --allow-write --quiet "$FILTER" \
	--format "$format" \
	--input "$status_file" \
	--allowed "$out/allowed-paths.txt" \
	--excluded "$out/excluded-paths.txt"

allowed=()
if [[ -s "$out/allowed-paths.txt" ]]; then
	mapfile -t allowed <"$out/allowed-paths.txt"
fi

: >"$out/sanitized.patch"
if ((${#allowed[@]} > 0)); then
	if [[ "$vcs" == jj ]]; then
		jj -R "$repo" --color=never diff --git -- "${allowed[@]}" >"$out/sanitized.patch"
	else
		git -C "$repo" --no-pager diff --no-ext-diff --no-textconv --no-color -M HEAD -- "${allowed[@]}" >"$out/sanitized.patch"
	fi
fi

if ! command -v rg >/dev/null 2>&1; then
	die "rg is required to scan the sanitized patch"
fi

if rg -q -- "$PRIVATE_KEY_HEADER_RE" "$out/sanitized.patch"; then
	rm -f "$out/sanitized.patch"
	die "private key marker found in sanitized patch"
fi
