#!/usr/bin/env bash
# Split a unified git/jj diff into chunks under a byte budget.
# File sections (`diff --git ...`) are never split, so every chunk is a valid
# standalone patch. Large patches can then be reviewed chunk-by-chunk to keep
# each model call under its timeout.
#
# Usage:
#   split_patch.sh --input PATCH --out DIR [--max-bytes N]
#
# Prints one chunk path per line (chunk-001.patch, chunk-002.patch, ...).
set -euo pipefail

die() {
	printf '%s\n' "$1" >&2
	exit "${2:-1}"
}

usage() {
	printf 'Usage: split_patch.sh --input PATCH --out DIR [--max-bytes N]\n' >&2
	exit 1
}

input=''
out=''
max_bytes=12000

while (($# > 0)); do
	case "$1" in
	--input)
		shift
		[[ $# -gt 0 ]] || usage
		input=$1
		;;
	--out)
		shift
		[[ $# -gt 0 ]] || usage
		out=$1
		;;
	--max-bytes)
		shift
		[[ $# -gt 0 ]] || usage
		max_bytes=$1
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

[[ -n "$input" ]] || die "missing required argument: --input"
[[ -n "$out" ]] || die "missing required argument: --out"
[[ -f "$input" ]] || die "input file not found: $input"
[[ "$max_bytes" =~ ^[0-9]+$ && "$max_bytes" -gt 0 ]] || die "--max-bytes must be a positive integer"

mkdir -p "$out"
# reused --out dirs must not leak stale chunks (a smaller split would otherwise
# leave old chunk-*.patch behind and corrupt a `cat chunk-*.patch` reassembly).
rm -f "$out"/chunk-*.patch

# Pack whole file sections into chunks greedily, flushing before a section would
# overflow the budget. A single oversized section becomes its own chunk.
# LC_ALL=C makes awk length() count bytes, not UTF-8 characters, so the byte
# budget stays accurate for patches containing non-ASCII text.
LC_ALL=C awk -v out="$out" -v maxb="$max_bytes" '
	function flush() {
		if (cur == "") return
		chunk++
		fname = sprintf("%s/chunk-%03d.patch", out, chunk)
		printf "%s", cur > fname
		close(fname)
		print fname
		cur = ""
		cursize = 0
	}
	function commit_section(   seclen) {
		if (sec == "") return
		seclen = length(sec)
		if (cursize > 0 && cursize + seclen > maxb) flush()
		cur = cur sec
		cursize += seclen
		sec = ""
	}
	/^diff --git / { commit_section() }
	{ sec = sec $0 "\n" }
	END {
		commit_section()
		flush()
	}
' "$input"
