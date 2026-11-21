#!/usr/bin/env bash
# Private shared validation for explicitly approved OSS workflows.
oss_warn_share() {
	printf '%s\n' 'WARNING: this explicitly selected Meta workflow allows submitted content to be used for training. This does not mean every item will be trained and is not a zero-retention guarantee. Inspect and have rights to share every item.' >&2
}

oss_check_content() {
	local path=$1 result
	[[ -f "$path" && -r "$path" ]] || die 'approved input must be a readable regular file'
	if ! cmp -s "$path" <(LC_ALL=C tr -d '\000' <"$path"); then die 'binary or unreadable content rejected'; fi
	local patterns="(-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----|\\b(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|sk_(live|test)_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{30,})\\b|(?i:Bearer[[:space:]]+[A-Za-z0-9._~+/-]{12,}|[A-Z0-9_]*API[_-]?KEY[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9._~+/-]{12,}))"
	set +e
	rg --no-config -a -q -e "$patterns" "$path" >/dev/null 2>&1
	result=$?
	set -e
	case "$result" in 0) die 'credential or private-key marker detected' ;; 1) ;; *) die 'content safety check failed closed' ;; esac
}
