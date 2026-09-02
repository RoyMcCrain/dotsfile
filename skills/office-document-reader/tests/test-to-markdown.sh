#!/usr/bin/env bash
# Integration tests for office-document-reader/scripts/to-markdown.sh
set -euo pipefail

die() {
	printf '%s\n' "$1" >&2
	exit 1
}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SKILL_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
CONVERTER="$SKILL_DIR/scripts/to-markdown.sh"
FIXTURE_SCRIPT="$SCRIPT_DIR/create_fixtures.py"

TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/office-document-reader-test.XXXXXX")
cleanup() {
	rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

FIXTURE_DIR="$TEST_ROOT/fixture files"
OUTPUT_DIR="$TEST_ROOT/output files"
mkdir -p "$FIXTURE_DIR" "$OUTPUT_DIR"

uv run \
	--with python-docx \
	--with python-pptx \
	--with openpyxl \
	python "$FIXTURE_SCRIPT" "$FIXTURE_DIR" >/dev/null

assert_rg() {
	local pattern=$1
	local file=$2
	local label=$3
	rg -q "$pattern" "$file" || die "expected $label in $file (pattern: $pattern)"
}

assert_fails_with() {
	local expected=$1
	local label=$2
	shift 2
	local stderr
	if stderr=$("$@" 2>&1 >/dev/null); then
		die "expected failure: $label"
	fi
	[[ "$stderr" == *"$expected"* ]] || die "expected error containing '$expected' for $label; got: $stderr"
}

# --- happy path conversions ---

DOCX_OUT="$OUTPUT_DIR/fixture-docx.md"
PPTX_OUT="$OUTPUT_DIR/fixture-pptx.md"
XLSX_OUT="$OUTPUT_DIR/fixture-xlsx.md"

[[ -x "$CONVERTER" ]] || [[ -f "$CONVERTER" ]] || die "converter script missing: $CONVERTER"

"$CONVERTER" "$FIXTURE_DIR/fixture.docx" "$DOCX_OUT" >/dev/null
"$CONVERTER" "$FIXTURE_DIR/fixture.pptx" "$PPTX_OUT" >/dev/null
"$CONVERTER" "$FIXTURE_DIR/fixture.xlsx" "$XLSX_OUT" >/dev/null

assert_rg 'Fixture DOCX Heading Alpha' "$DOCX_OUT" 'DOCX heading'
assert_rg 'Fixture DOCX paragraph beta' "$DOCX_OUT" 'DOCX paragraph'
assert_rg 'FixtureTableHeaderA' "$DOCX_OUT" 'DOCX table header'
assert_rg 'FixtureCellValue42' "$DOCX_OUT" 'DOCX table cell'

assert_rg 'Fixture PPTX Title Gamma' "$PPTX_OUT" 'PPTX title'
assert_rg 'Fixture PPTX body delta' "$PPTX_OUT" 'PPTX body'
assert_rg '<!-- Slide number: 1 -->' "$PPTX_OUT" 'PPTX slide marker'
assert_rg 'Fixture speaker notes epsilon' "$PPTX_OUT" 'PPTX speaker notes'

assert_rg 'FixtureSheetOne' "$XLSX_OUT" 'XLSX sheet one'
assert_rg 'FixtureSheetTwo' "$XLSX_OUT" 'XLSX sheet two'
assert_rg 'FixtureXlsxValue111' "$XLSX_OUT" 'XLSX value sheet one'
assert_rg 'FixtureXlsxValue333' "$XLSX_OUT" 'XLSX value sheet two'

# --- default output uses unique private directories ---

DEFAULT_TMP="$TEST_ROOT/default tmp"
mkdir -p "$DEFAULT_TMP"
DEFAULT_OUT_ONE=$(TMPDIR="$DEFAULT_TMP" "$CONVERTER" "$FIXTURE_DIR/fixture.docx")
DEFAULT_OUT_TWO=$(TMPDIR="$DEFAULT_TMP" "$CONVERTER" "$FIXTURE_DIR/fixture.docx")
[[ "$DEFAULT_OUT_ONE" != "$DEFAULT_OUT_TWO" ]] || die "default outputs should be unique: $DEFAULT_OUT_ONE"
[[ "$DEFAULT_OUT_ONE" == *"/office-document-reader."*"/fixture.md" ]] || die "unexpected default output path: $DEFAULT_OUT_ONE"
[[ "$DEFAULT_OUT_TWO" == *"/office-document-reader."*"/fixture.md" ]] || die "unexpected default output path: $DEFAULT_OUT_TWO"
assert_rg 'Fixture DOCX Heading Alpha' "$DEFAULT_OUT_ONE" 'default-output DOCX heading one'
assert_rg 'Fixture DOCX Heading Alpha' "$DEFAULT_OUT_TWO" 'default-output DOCX heading two'

# --- leading-dash input basename ---

DASH_FIXTURE_DIR="$TEST_ROOT/dash fixture dir"
DASH_OUTPUT="$OUTPUT_DIR/dash-fixture.md"
mkdir -p "$DASH_FIXTURE_DIR"
cp "$FIXTURE_DIR/fixture.docx" "$DASH_FIXTURE_DIR/-fixture.docx"
(
	cd "$DASH_FIXTURE_DIR" || exit 1
	"$CONVERTER" '-fixture.docx' "$DASH_OUTPUT" >/dev/null
)
assert_rg 'Fixture DOCX Heading Alpha' "$DASH_OUTPUT" 'leading-dash DOCX heading'

# --- rejection cases ---

UNSUPPORTED="$FIXTURE_DIR/unsupported.txt"
printf 'not an office file\n' >"$UNSUPPORTED"
assert_fails_with 'unsupported extension (expected .docx, .pptx, or .xlsx)' "unsupported extension" \
	"$CONVERTER" "$UNSUPPORTED" "$OUTPUT_DIR/bad.md"

assert_fails_with 'URLs are not supported' "https URL input" \
	"$CONVERTER" 'https://example.com/file.docx' "$OUTPUT_DIR/url.md"
assert_fails_with 'output path must end with .md or .markdown' "non-Markdown output" \
	"$CONVERTER" "$FIXTURE_DIR/fixture.docx" "$OUTPUT_DIR/bad.txt"

EXISTING_OUT="$OUTPUT_DIR/existing-output.md"
printf 'sentinel content must remain\n' >"$EXISTING_OUT"
assert_fails_with 'output path already exists' "existing explicit output" \
	"$CONVERTER" "$FIXTURE_DIR/fixture.docx" "$EXISTING_OUT"
assert_rg 'sentinel content must remain' "$EXISTING_OUT" 'existing output unchanged'

printf 'office-document-reader tests passed\n'
