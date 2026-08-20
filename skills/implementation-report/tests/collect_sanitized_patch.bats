#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/sanitized-patch"
	mkdir -p "$TEST_ROOT"
	REPO="$TEST_ROOT/repo"
	OUT="$TEST_ROOT/out"
	COLLECT="$BATS_TEST_DIRNAME/../scripts/collect_sanitized_patch.sh"
}

init_git_repo() {
	mkdir -p "$REPO"
	git -C "$REPO" init -q
	git -C "$REPO" config user.email test@example.com
	git -C "$REPO" config user.name test
	git -C "$REPO" config commit.gpgsign false
}

commit_file() {
	local path=$1
	local content=$2
	local dir
	dir=$(dirname "$REPO/$path")
	mkdir -p "$dir"
	printf '%s\n' "$content" >"$REPO/$path"
	git -C "$REPO" add -- "$path"
	git -C "$REPO" commit -q -m "add $path"
}

@test "excludes secret paths from the sanitized patch" {
	# Arrange
	init_git_repo
	commit_file "src/app.ts" "export const ok = 1;"
	commit_file ".env" "SUPER_SECRET_VALUE=1"
	commit_file "id_ed25519" "ssh-secret"
	printf '%s\n' "export const ok = 2;" >"$REPO/src/app.ts"
	printf '%s\n' "SUPER_SECRET_VALUE=2" >"$REPO/.env"
	printf '%s\n' "ssh-secret-2" >"$REPO/id_ed25519"

	# Act
	run "$COLLECT" --repo "$REPO" --out "$OUT"

	# Assert
	[ "$status" -eq 0 ]
	[[ "$(cat "$OUT/allowed-paths.txt")" == *src/app.ts* ]]
	[[ "$(cat "$OUT/excluded-paths.txt")" == *.env* ]]
	[[ "$(cat "$OUT/excluded-paths.txt")" == *id_ed25519* ]]
	[[ "$(cat "$OUT/sanitized.patch")" == *src/app.ts* ]]
	[[ "$(cat "$OUT/sanitized.patch")" != *SUPER_SECRET_VALUE* ]]
	[[ "$(cat "$OUT/sanitized.patch")" != *id_ed25519* ]]
}

@test "does not leave an unsanitized full patch on disk" {
	# Arrange
	init_git_repo
	commit_file "src/app.ts" "export const ok = 1;"
	commit_file ".env" "SUPER_SECRET_VALUE=1"
	printf '%s\n' "export const ok = 2;" >"$REPO/src/app.ts"
	printf '%s\n' "SUPER_SECRET_VALUE=2" >"$REPO/.env"

	# Act
	run "$COLLECT" --repo "$REPO" --out "$OUT"

	# Assert
	[ "$status" -eq 0 ]
	! rg -q -- "SUPER_SECRET_VALUE" "$OUT"
	[ "$(fd -e patch . "$OUT" "$REPO" | wc -l)" -eq 1 ]
	[ -f "$OUT/sanitized.patch" ]
}

@test "excludes a rename when either side is a secret path" {
	# Arrange
	init_git_repo
	commit_file "id_ed25519" "ssh-secret"
	commit_file "readme.txt" "hello"
	git -C "$REPO" mv id_ed25519 published-key.txt
	git -C "$REPO" mv readme.txt .env

	# Act
	run "$COLLECT" --repo "$REPO" --out "$OUT"

	# Assert
	[ "$status" -eq 0 ]
	[[ "$(cat "$OUT/excluded-paths.txt")" == *published-key.txt* ]]
	[[ "$(cat "$OUT/excluded-paths.txt")" == *.env* ]]
	[[ "$(cat "$OUT/sanitized.patch")" != *published-key.txt* ]]
	[[ "$(cat "$OUT/sanitized.patch")" != *ssh-secret* ]]
}

@test "empty diff exits 0 and writes an empty sanitized patch" {
	# Arrange
	init_git_repo
	commit_file "src/app.ts" "export const ok = 1;"

	# Act
	run "$COLLECT" --repo "$REPO" --out "$OUT"

	# Assert
	[ "$status" -eq 0 ]
	[ -f "$OUT/sanitized.patch" ]
	[ ! -s "$OUT/sanitized.patch" ]
}

@test "keeps both old and new paths for allowed renames" {
	# Arrange
	init_git_repo
	commit_file "src/old.ts" "export const value = 1;"
	git -C "$REPO" mv src/old.ts src/new.ts

	# Act
	run "$COLLECT" --repo "$REPO" --out "$OUT"

	# Assert
	[ "$status" -eq 0 ]
	[[ "$(cat "$OUT/allowed-paths.txt")" == *src/old.ts* ]]
	[[ "$(cat "$OUT/allowed-paths.txt")" == *src/new.ts* ]]
	[[ "$(cat "$OUT/sanitized.patch")" == *"rename from src/old.ts"* ]]
	[[ "$(cat "$OUT/sanitized.patch")" == *"rename to src/new.ts"* ]]
}

@test "fails when a private key marker is present in the sanitized patch" {
	# Arrange
	init_git_repo
	commit_file "src/app.ts" "export const ok = 1;"
	local marker
	marker="-----BEGIN PRIVATE "
	marker+="KEY-----"
	printf '%s\n' "$marker" "secret" >"$REPO/src/app.ts"

	# Act
	run "$COLLECT" --repo "$REPO" --out "$OUT"

	# Assert
	[ "$status" -ne 0 ]
	[[ "$output" == *"private key marker"* ]]
	[ ! -e "$OUT/sanitized.patch" ]
}
