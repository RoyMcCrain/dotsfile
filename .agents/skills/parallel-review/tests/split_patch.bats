#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/split-patch"
	mkdir -p "$TEST_ROOT"
	SPLITTER="$BATS_TEST_DIRNAME/../scripts/split_patch.sh"
	PATCH="$TEST_ROOT/changes.patch"
	OUT="$TEST_ROOT/chunks"
}

# Build a diff with three file sections of increasing size.
write_patch() {
	{
		printf 'diff --git a/a.txt b/a.txt\n'
		printf -- '--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n'
		printf 'diff --git a/b.txt b/b.txt\n'
		printf -- '--- a/b.txt\n+++ b/b.txt\n@@ -1,3 +1,3 @@\n'
		printf -- '-b1\n-b2\n-b3\n+B1\n+B2\n+B3\n'
		printf 'diff --git a/c.txt b/c.txt\n'
		printf -- '--- a/c.txt\n+++ b/c.txt\n@@ -1,2 +1,2 @@\n-c1\n-c2\n+C1\n+C2\n'
	} >"$PATCH"
}

@test "splits into chunks that reassemble byte-identical to the source" {
	# Arrange
	write_patch

	# Act
	run "$SPLITTER" --input "$PATCH" --out "$OUT" --max-bytes 60

	# Assert
	[ "$status" -eq 0 ]
	cat $OUT/chunk-*.patch >"$TEST_ROOT/reassembled.patch"
	cmp "$PATCH" "$TEST_ROOT/reassembled.patch"
}

@test "every chunk starts at a diff --git boundary" {
	# Arrange
	write_patch

	# Act
	run "$SPLITTER" --input "$PATCH" --out "$OUT" --max-bytes 60

	# Assert
	[ "$status" -eq 0 ]
	for f in "$OUT"/chunk-*.patch; do
		head -1 "$f" | grep -q '^diff --git '
	done
}

@test "keeps an oversized file section whole in its own chunk" {
	# Arrange
	write_patch

	# Act: budget smaller than any single section forces one section per chunk
	run "$SPLITTER" --input "$PATCH" --out "$OUT" --max-bytes 1

	# Assert
	[ "$status" -eq 0 ]
	[ "$(printf '%s\n' "$output" | grep -c 'chunk-')" -eq 3 ]
}

@test "packs multiple small sections into one chunk under the budget" {
	# Arrange
	write_patch

	# Act: generous budget fits all three sections in a single chunk
	run "$SPLITTER" --input "$PATCH" --out "$OUT" --max-bytes 100000

	# Assert
	[ "$status" -eq 0 ]
	[ "$(printf '%s\n' "$output" | grep -c 'chunk-')" -eq 1 ]
}

@test "rejects a missing input file" {
	# Act
	run "$SPLITTER" --input "$TEST_ROOT/nope.patch" --out "$OUT"

	# Assert
	[ "$status" -ne 0 ]
	[[ "$output" == *"input file not found"* ]]
}

@test "rejects a non-positive --max-bytes" {
	# Arrange
	write_patch

	# Act
	run "$SPLITTER" --input "$PATCH" --out "$OUT" --max-bytes 0

	# Assert
	[ "$status" -ne 0 ]
	[[ "$output" == *"positive integer"* ]]
}
