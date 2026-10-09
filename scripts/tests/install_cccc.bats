#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
INSTALLER="$REPO_ROOT/scripts/build_env/install_cccc.sh"
REAL_SHA256SUM="$(command -v sha256sum 2>/dev/null || true)"

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/cccc-install"
	HOME="$TEST_ROOT/home with spaces"
	STUB_BIN="$TEST_ROOT/stub-bin"
	WGET_LOG="$TEST_ROOT/wget.log"
	WGET_OUT_FILE="$TEST_ROOT/wget-out.path"
	HASH_LOG="$TEST_ROOT/hash.log"
	mkdir -p "$HOME/.local/bin" "$STUB_BIN"
	export HOME WGET_LOG WGET_OUT_FILE HASH_LOG
	export BATS_CCCC_WGET_OUT_FILE="$WGET_OUT_FILE"
	export BATS_CCCC_HASH_LOG="$HASH_LOG"
	write_wget_stub
	write_uname_stub "Darwin" "arm64"
	write_sha_stub
	PATH="$STUB_BIN:$PATH"
	export PATH
}

write_uname_stub() {
	local os=$1
	local arch=$2
	cat >"$STUB_BIN/uname" <<EOF
#!/usr/bin/env bash
case "\$1" in
-s) printf '%s\n' '$os' ;;
-m) printf '%s\n' '$arch' ;;
*) exit 1 ;;
esac
EOF
	chmod +x "$STUB_BIN/uname"
}

write_wget_stub() {
	cat >"$STUB_BIN/wget" <<'EOF'
#!/usr/bin/env bash
if [[ "${BATS_CCCC_WGET_FAIL:-}" == "1" ]]; then
	exit 1
fi
url=""
out=""
while [[ $# -gt 0 ]]; do
	case "$1" in
	-O)
		out=$2
		shift 2
		;;
	*)
		url=$1
		shift
		;;
	esac
done
printf '%s\n' "$url" >>"${WGET_LOG:-/dev/null}"
if [[ -n "$out" && -n "${BATS_CCCC_WGET_OUT_FILE:-}" ]]; then
	printf '%s' "$out" >"${BATS_CCCC_WGET_OUT_FILE}"
fi
if [[ -n "${BATS_CCCC_ARCHIVE_SRC:-}" ]]; then
	cp "${BATS_CCCC_ARCHIVE_SRC}" "$out"
	exit 0
fi
exit 1
EOF
	chmod +x "$STUB_BIN/wget"
}

write_sha_stub() {
	cat >"$STUB_BIN/sha256sum" <<'EOF'
#!/usr/bin/env bash
{
	printf 'sha256sum'
	for arg in "$@"; do printf ' %q' "$arg"; done
	printf '\n'
} >>"${BATS_CCCC_HASH_LOG:-/dev/null}"
out_file="${BATS_CCCC_WGET_OUT_FILE:-}"
if [[ -s "$out_file" ]]; then
	expected="$(<"$out_file")"
	if [[ $# -ne 1 || "$1" != "$expected" ]]; then
		echo "sha256sum: expected exactly the downloaded archive" >&2
		exit 1
	fi
	if [[ "$(basename "$1")" != "cccc.tar.gz" || ! -f "$1" ]]; then
		echo "sha256sum: not the downloaded cccc.tar.gz" >&2
		exit 1
	fi
fi
if [[ -n "${BATS_CCCC_EXPECT_SHA:-}" ]]; then
	printf '%s  %s\n' "$BATS_CCCC_EXPECT_SHA" "$1"
	exit 0
fi
if [[ -n "${BATS_CCCC_BAD_SHA:-}" ]]; then
	printf '%s  %s\n' "${BATS_CCCC_BAD_SHA}" "$1"
	exit 0
fi
EOF
	if [[ -n "$REAL_SHA256SUM" ]]; then
		cat >>"$STUB_BIN/sha256sum" <<EOF
exec '$REAL_SHA256SUM' "\$@"
EOF
	else
		cat >>"$STUB_BIN/sha256sum" <<'EOF'
exit 127
EOF
	fi
	chmod +x "$STUB_BIN/sha256sum"

	cat >"$STUB_BIN/shasum" <<'EOF'
#!/usr/bin/env bash
{
	printf 'shasum'
	for arg in "$@"; do printf ' %q' "$arg"; done
	printf '\n'
} >>"${BATS_CCCC_HASH_LOG:-/dev/null}"
out_file="${BATS_CCCC_WGET_OUT_FILE:-}"
if [[ -s "$out_file" ]]; then
	expected="$(<"$out_file")"
	if [[ $# -ne 3 || "$1" != "-a" || "$2" != "256" || "$3" != "$expected" ]]; then
		echo "shasum: requires -a 256 on the downloaded archive" >&2
		exit 1
	fi
	if [[ "$(basename "$3")" != "cccc.tar.gz" || ! -f "$3" ]]; then
		echo "shasum: not the downloaded cccc.tar.gz" >&2
		exit 1
	fi
fi
if [[ -n "${BATS_CCCC_EXPECT_SHA:-}" ]]; then
	printf '%s  %s\n' "$BATS_CCCC_EXPECT_SHA" "${@: -1}"
	exit 0
fi
if [[ -n "${BATS_CCCC_BAD_SHA:-}" ]]; then
	printf '%s  %s\n' "${BATS_CCCC_BAD_SHA}" "${@: -1}"
	exit 0
fi
EOF
	cat >>"$STUB_BIN/shasum" <<'EOF'
exit 127
EOF
	chmod +x "$STUB_BIN/shasum"
}

make_test_archive() {
	local work=$1
	local dest=$2
	local body=${3:-fake-cccc-binary}
	mkdir -p "$work"
	printf '%s\n' "$body" >"$work/cccc"
	chmod +x "$work/cccc"
	printf 'readme\n' >"$work/README.md"
	printf 'license\n' >"$work/LICENSE"
	tar -czf "$dest" -C "$work" cccc README.md LICENSE
}

make_archive_without_cccc() {
	local work=$1
	local dest=$2
	mkdir -p "$work"
	printf 'readme-only\n' >"$work/README.md"
	tar -czf "$dest" -C "$work" README.md
}

link_real_tool() {
	local dest_dir=$1
	local tool=$2
	local real
	real="$(command -v "$tool" 2>/dev/null || true)"
	[[ -z "$real" || "$real" == "$STUB_BIN/$tool" ]] && return 0
	ln -sf "$real" "$dest_dir/$tool"
}

build_installer_private_bin() {
	local dest=$1
	mkdir -p "$dest"
	ln -sf "$STUB_BIN/wget" "$dest/wget"
	ln -sf "$STUB_BIN/uname" "$dest/uname"
	ln -sf "$STUB_BIN/shasum" "$dest/shasum"
	local tool
	for tool in tar bash chmod mkdir mktemp rm mv awk cp basename gzip gunzip; do
		link_real_tool "$dest" "$tool"
	done
}

run_installer() {
	local child_path=${1:-}
	local installer_tmpdir=${2:-}
	local -a runner=(env
		BATS_CCCC_WGET_FAIL="${BATS_CCCC_WGET_FAIL:-}"
		BATS_CCCC_ARCHIVE_SRC="${BATS_CCCC_ARCHIVE_SRC:-}"
		BATS_CCCC_EXPECT_SHA="${BATS_CCCC_EXPECT_SHA:-}"
		BATS_CCCC_BAD_SHA="${BATS_CCCC_BAD_SHA:-}"
		BATS_CCCC_WGET_OUT_FILE="${BATS_CCCC_WGET_OUT_FILE:-$WGET_OUT_FILE}"
		BATS_CCCC_HASH_LOG="${BATS_CCCC_HASH_LOG:-$HASH_LOG}"
	)
	if [[ -n "$child_path" ]]; then
		runner+=(PATH="$child_path")
	fi
	if [[ -n "$installer_tmpdir" ]]; then
		runner+=(TMPDIR="$installer_tmpdir")
	fi
	runner+=(bash "$INSTALLER")
	run "${runner[@]}"
}

assert_cccc_content() {
	local needle=$1
	local file=$2
	local body
	body="$(<"$file")"
	[[ "$body" == *"$needle"* ]]
}

assert_hashed_download() {
	local hash_command=$1
	local archive_path=$2
	local quoted_path
	[[ -s "$HASH_LOG" ]]
	[[ -s "$WGET_LOG" ]]
	printf -v quoted_path '%q' "$archive_path"
	rg -Fx -- "$hash_command $quoted_path" "$HASH_LOG"
	[[ "$(<"$WGET_OUT_FILE")" == "$archive_path" ]]
}

@test "install_cccc: Darwin arm64 uses pinned URL and checksum" {
	: >"$WGET_LOG"
	: >"$HASH_LOG"
	: >"$WGET_OUT_FILE"
	archive="$TEST_ROOT/arm64.tar.gz"
	make_test_archive "$TEST_ROOT/work-a" "$archive"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="bb80e21b0a0ef19a08dbb7e86cb87718d1b4960976cc6600c7f1fa7373c1848a"
	run_installer
	[ "$status" -eq 0 ]
	rg -F 'https://github.com/moznion/cccc/releases/download/v1.7.1/cccc-v1.7.1-aarch64-apple-darwin.tar.gz' "$WGET_LOG"
	assert_hashed_download 'sha256sum' "$(<"$WGET_OUT_FILE")"
	[ -x "$HOME/.local/bin/cccc" ]
}

@test "install_cccc: Darwin x86_64 uses pinned URL and checksum" {
	write_uname_stub "Darwin" "x86_64"
	: >"$WGET_LOG"
	archive="$TEST_ROOT/x86darwin.tar.gz"
	make_test_archive "$TEST_ROOT/work-b" "$archive"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="3dcde2f100558213a5acb96a54c8e9c8fd495a4caf18cef3a8522b3c673262fb"
	run_installer
	[ "$status" -eq 0 ]
	rg -F 'cccc-v1.7.1-x86_64-apple-darwin.tar.gz' "$WGET_LOG"
}

@test "install_cccc: Linux aarch64 uses pinned URL and checksum" {
	write_uname_stub "Linux" "aarch64"
	archive="$TEST_ROOT/linux-arm.tar.gz"
	make_test_archive "$TEST_ROOT/work-c" "$archive"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="1dc67123cac31a20d4b316ba596e369daf02f35c378dd9052d0e64c92ad43177"
	run_installer
	[ "$status" -eq 0 ]
	rg -F 'cccc-v1.7.1-aarch64-unknown-linux-musl.tar.gz' "$WGET_LOG"
}

@test "install_cccc: Linux x86_64 uses pinned URL and checksum" {
	write_uname_stub "Linux" "x86_64"
	archive="$TEST_ROOT/linux-amd.tar.gz"
	make_test_archive "$TEST_ROOT/work-d" "$archive"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="6b7688d357da22b37a3f4129a1f0ec84d1f2ff97b015ea40fc8dfa4c778e5373"
	run_installer
	[ "$status" -eq 0 ]
	rg -F 'cccc-v1.7.1-x86_64-unknown-linux-musl.tar.gz' "$WGET_LOG"
}

@test "install_cccc: installs executable under HOME path with spaces" {
	archive="$TEST_ROOT/spaces.tar.gz"
	make_test_archive "$TEST_ROOT/work-sp" "$archive" "spaces-body"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="bb80e21b0a0ef19a08dbb7e86cb87718d1b4960976cc6600c7f1fa7373c1848a"
	run_installer
	[ "$status" -eq 0 ]
	[ -f "$HOME/.local/bin/cccc" ]
	[ -x "$HOME/.local/bin/cccc" ]
	assert_cccc_content 'spaces-body' "$HOME/.local/bin/cccc"
}

@test "install_cccc: re-run replaces managed binary successfully" {
	archive="$TEST_ROOT/rerun.tar.gz"
	make_test_archive "$TEST_ROOT/work-r1" "$archive" "version-one"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="bb80e21b0a0ef19a08dbb7e86cb87718d1b4960976cc6600c7f1fa7373c1848a"
	run_installer
	[ "$status" -eq 0 ]
	make_test_archive "$TEST_ROOT/work-r2" "$archive" "version-two"
	run_installer
	[ "$status" -eq 0 ]
	assert_cccc_content 'version-two' "$HOME/.local/bin/cccc"
}

@test "install_cccc: checksum mismatch leaves existing binary unchanged" {
	printf 'keep-me\n' >"$HOME/.local/bin/cccc"
	chmod +x "$HOME/.local/bin/cccc"
	: >"$HASH_LOG"
	: >"$WGET_OUT_FILE"
	archive="$TEST_ROOT/badsum.tar.gz"
	make_test_archive "$TEST_ROOT/work-bad" "$archive"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_BAD_SHA="0000000000000000000000000000000000000000000000000000000000000000"
	unset BATS_CCCC_EXPECT_SHA
	run_installer
	[ "$status" -ne 0 ]
	[[ "$output" == *"checksum mismatch"* ]]
	assert_hashed_download 'sha256sum' "$(<"$WGET_OUT_FILE")"
	assert_cccc_content 'keep-me' "$HOME/.local/bin/cccc"
}

@test "install_cccc: wget failure leaves existing binary unchanged" {
	printf 'wget-keep\n' >"$HOME/.local/bin/cccc"
	chmod +x "$HOME/.local/bin/cccc"
	export BATS_CCCC_WGET_FAIL=1
	unset BATS_CCCC_ARCHIVE_SRC
	run_installer
	[ "$status" -ne 0 ]
	[[ "$output" == *"download failed"* ]]
	assert_cccc_content 'wget-keep' "$HOME/.local/bin/cccc"
}

@test "install_cccc: unsupported platform fails before wget" {
	write_uname_stub "FreeBSD" "amd64"
	: >"$WGET_LOG"
	unset BATS_CCCC_ARCHIVE_SRC BATS_CCCC_WGET_FAIL
	run_installer
	[ "$status" -ne 0 ]
	[[ "$output" == *"unsupported platform"* ]]
	[ ! -s "$WGET_LOG" ]
}

@test "install_cccc: refuses destination symlink" {
	ln -s /tmp/other "$HOME/.local/bin/cccc"
	archive="$TEST_ROOT/symlink.tar.gz"
	make_test_archive "$TEST_ROOT/work-sy" "$archive"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="bb80e21b0a0ef19a08dbb7e86cb87718d1b4960976cc6600c7f1fa7373c1848a"
	run_installer
	[ "$status" -ne 0 ]
	[[ "$output" == *"refusing to replace symlink"* ]]
	[ -L "$HOME/.local/bin/cccc" ]
}

@test "install_cccc: refuses non-regular destination directory" {
	mkdir "$HOME/.local/bin/cccc"
	archive="$TEST_ROOT/dir.tar.gz"
	make_test_archive "$TEST_ROOT/work-dir" "$archive"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="bb80e21b0a0ef19a08dbb7e86cb87718d1b4960976cc6600c7f1fa7373c1848a"
	run_installer
	[ "$status" -ne 0 ]
	[[ "$output" == *"refusing non-regular destination"* ]]
	[ -d "$HOME/.local/bin/cccc" ]
}

@test "install_cccc: valid checksum archive without cccc leaves existing binary unchanged" {
	printf 'keep-extract\n' >"$HOME/.local/bin/cccc"
	chmod +x "$HOME/.local/bin/cccc"
	archive="$TEST_ROOT/no-cccc-member.tar.gz"
	make_archive_without_cccc "$TEST_ROOT/work-noc" "$archive"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="bb80e21b0a0ef19a08dbb7e86cb87718d1b4960976cc6600c7f1fa7373c1848a"
	unset BATS_CCCC_BAD_SHA
	run_installer
	[ "$status" -ne 0 ]
	[[ "$output" == *"failed to extract cccc from archive"* ]]
	assert_cccc_content 'keep-extract' "$HOME/.local/bin/cccc"
}

@test "install_cccc: falls back to shasum when sha256sum is unavailable" {
	: >"$HASH_LOG"
	: >"$WGET_OUT_FILE"
	archive="$TEST_ROOT/shasum.tar.gz"
	make_test_archive "$TEST_ROOT/work-sh" "$archive"
	export BATS_CCCC_ARCHIVE_SRC="$archive"
	export BATS_CCCC_EXPECT_SHA="bb80e21b0a0ef19a08dbb7e86cb87718d1b4960976cc6600c7f1fa7373c1848a"
	installer_bin="$TEST_ROOT/installer-private-bin"
	build_installer_private_bin "$installer_bin"
	[[ ! -x "$installer_bin/sha256sum" ]]
	space_tmp="$TEST_ROOT/tmp with spaces"
	mkdir -p "$space_tmp"
	run_installer "$installer_bin" "$space_tmp"
	[ "$status" -eq 0 ]
	[ -x "$HOME/.local/bin/cccc" ]
	assert_hashed_download 'shasum -a 256' "$(<"$WGET_OUT_FILE")"
	run rg '^sha256sum ' "$HASH_LOG"
	[ "$status" -ne 0 ]
}

@test "install_cccc: shasum stub rejects non-256 algorithm" {
	downloaded="$TEST_ROOT/stub/cccc.tar.gz"
	mkdir -p "$TEST_ROOT/stub"
	printf 'archive-bytes\n' >"$downloaded"
	printf '%s' "$downloaded" >"$WGET_OUT_FILE"
	run env BATS_CCCC_WGET_OUT_FILE="$WGET_OUT_FILE" \
		BATS_CCCC_EXPECT_SHA="bb80e21b0a0ef19a08dbb7e86cb87718d1b4960976cc6600c7f1fa7373c1848a" \
		BATS_CCCC_HASH_LOG="$HASH_LOG" \
		"$STUB_BIN/shasum" -a 1 "$downloaded"
	[ "$status" -ne 0 ]
}
