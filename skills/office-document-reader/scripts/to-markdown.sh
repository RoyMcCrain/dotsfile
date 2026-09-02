#!/usr/bin/env bash
# Convert local DOCX, PPTX, or XLSX to Markdown locally via Microsoft MarkItDown.
set -euo pipefail

die() {
	printf '%s\n' "$1" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Usage: to-markdown.sh INPUT [OUTPUT.md]

Convert a local .docx, .pptx, or .xlsx file to Markdown.
If OUTPUT is omitted, writes to a unique private directory under
${TMPDIR:-/tmp}/office-document-reader.XXXXXX/<stem>.md
EOF
}

is_supported_extension() {
	local path_lower
	path_lower=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
	case "$path_lower" in
	*.docx | *.pptx | *.xlsx) return 0 ;;
	*) return 1 ;;
	esac
}

default_output_path() {
	local input=$1
	local stem
	local output_dir

	umask 077
	output_dir=$(mktemp -d "${TMPDIR:-/tmp}/office-document-reader.XXXXXX")
	stem=$(basename "$input")
	stem="${stem%.*}"
	printf '%s/%s.md' "$output_dir" "$stem"
}

validate_output_path() {
	local output=$1
	local output_lower
	output_lower=$(printf '%s' "$output" | tr '[:upper:]' '[:lower:]')
	case "$output_lower" in
	*.md | *.markdown) ;;
	*) die "output path must end with .md or .markdown: $output" ;;
	esac
}

ensure_output_writable() {
	local output=$1

	if [[ -e "$output" || -L "$output" ]]; then
		die "output path already exists: $output"
	fi

	umask 077
	mkdir -p "$(dirname "$output")"
}

run_markitdown() {
	local input=$1
	local output=$2

	if command -v uvx >/dev/null 2>&1; then
		uvx --from 'markitdown[docx,pptx,xlsx]==0.1.7' markitdown -o "$output" -- "$input"
	elif command -v markitdown >/dev/null 2>&1; then
		markitdown -o "$output" -- "$input"
	else
		die "markitdown not found; install uv (for uvx) or markitdown[docx,pptx,xlsx]"
	fi
}

main() {
	if (($# < 1 || $# > 2)); then
		usage >&2
		exit 1
	fi

	case "$1" in
	-h | --help)
		usage
		exit 0
		;;
	esac

	local input=$1
	local output=${2:-}

	case "$input" in
	http://* | https://*) die "URLs are not supported; provide a local file path: $input" ;;
	esac

	[[ -f "$input" ]] || die "input file not found: $input"
	[[ -r "$input" ]] || die "input file is not readable: $input"

	is_supported_extension "$input" || die "unsupported extension (expected .docx, .pptx, or .xlsx): $input"

	if [[ -z "$output" ]]; then
		output=$(default_output_path "$input")
	else
		validate_output_path "$output"
		ensure_output_writable "$output"
	fi

	run_markitdown "$input" "$output"

	printf '%s\n' "$output"
}

main "$@"
