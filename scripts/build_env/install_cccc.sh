#!/usr/bin/env bash
set -euo pipefail

# Bump VERSION and all four SHA256 values together when updating cccc.
VERSION="1.7.1"

dest_dir="${HOME}/.local/bin"
dest="${dest_dir}/cccc"
stage=""

sha256_of() {
	local file=$1
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$file" | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$file" | awk '{print $1}'
	else
		echo "sha256sum or shasum -a 256 is required" >&2
		exit 1
	fi
}

refuse_bad_destination() {
	if [[ -L "$dest" ]]; then
		echo "refusing to replace symlink: $dest" >&2
		exit 1
	fi
	if [[ -e "$dest" && ! -f "$dest" ]]; then
		echo "refusing non-regular destination: $dest" >&2
		exit 1
	fi
}

os="$(uname -s)"
arch="$(uname -m)"
case "${os}-${arch}" in
Darwin-arm64 | Darwin-aarch64)
	target="aarch64-apple-darwin"
	expected="bb80e21b0a0ef19a08dbb7e86cb87718d1b4960976cc6600c7f1fa7373c1848a"
	;;
Darwin-x86_64)
	target="x86_64-apple-darwin"
	expected="3dcde2f100558213a5acb96a54c8e9c8fd495a4caf18cef3a8522b3c673262fb"
	;;
Linux-aarch64 | Linux-arm64)
	target="aarch64-unknown-linux-musl"
	expected="1dc67123cac31a20d4b316ba596e369daf02f35c378dd9052d0e64c92ad43177"
	;;
Linux-x86_64)
	target="x86_64-unknown-linux-musl"
	expected="6b7688d357da22b37a3f4129a1f0ec84d1f2ff97b015ea40fc8dfa4c778e5373"
	;;
*)
	echo "unsupported platform: ${os}-${arch}" >&2
	exit 1
	;;
esac

refuse_bad_destination

if ! command -v wget >/dev/null 2>&1; then
	echo "wget is required" >&2
	exit 1
fi

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/cccc-install.XXXXXX")"
archive="${tmpdir}/cccc.tar.gz"
extracted="${tmpdir}/cccc"

cleanup() {
	if [[ -n "$stage" && -f "$stage" ]]; then
		rm -f "$stage"
	fi
	rm -f "$archive"
	if [[ -f "$extracted" ]]; then
		rm -f "$extracted"
	fi
	rmdir "$tmpdir" 2>/dev/null || true
}
trap cleanup EXIT

url="https://github.com/moznion/cccc/releases/download/v${VERSION}/cccc-v${VERSION}-${target}.tar.gz"
if ! wget -q -O "$archive" "$url"; then
	echo "download failed: $url" >&2
	exit 1
fi

actual="$(sha256_of "$archive")"
if [[ "$actual" != "$expected" ]]; then
	echo "checksum mismatch for $url" >&2
	echo "expected: $expected" >&2
	echo "actual:   $actual" >&2
	exit 1
fi

if ! tar -xzf "$archive" -C "$tmpdir" cccc; then
	echo "failed to extract cccc from archive" >&2
	exit 1
fi

chmod 0755 "$extracted"

refuse_bad_destination

mkdir -p "$dest_dir"
stage="$(mktemp "${dest_dir}/.cccc.staging.XXXXXX")"
mv -f "$extracted" "$stage"

refuse_bad_destination

mv -f "$stage" "$dest"
stage=""

echo "Installed cccc ${VERSION} to ${dest}"
