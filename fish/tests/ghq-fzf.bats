#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
FISH_BIN="$(command -v fish)"
FD_BIN="$(command -v fd)"
SHASUM_BIN="$(command -v shasum)"
SD_BIN="$(command -v sd)"
REAL_FZF_BIN="$(command -v fzf)"
TOOL_PATH="$(dirname "$FD_BIN"):$(dirname "$SHASUM_BIN"):$(dirname "$SD_BIN"):/usr/bin:/bin"

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/ghq-fzf-test"
	HOME="$TEST_ROOT/home"
	GHQ_ROOT="$HOME/ghq"
	STUB_BIN="$TEST_ROOT/stub-bin"
	FZF_LOG="$TEST_ROOT/fzf-args.log"
	FZF_STDIN_LOG="$TEST_ROOT/fzf-stdin.log"
	CD_LOG="$TEST_ROOT/cd.log"
	mkdir -p "$HOME/.cache" "$HOME/.config/fish" "$STUB_BIN"
	export HOME USER="${USER:-testuser}" GHQ_ROOT FZF_LOG FZF_STDIN_LOG CD_LOG
	write_stubs
}

write_stubs() {
	cat >"$STUB_BIN/ghq" <<EOF
#!/bin/sh
case "\$1" in
root) printf '%s\n' "\$GHQ_ROOT" ;;
*) exit 1 ;;
esac
EOF
	cat >"$STUB_BIN/jj" <<'EOF'
#!/bin/sh
case "$1" in
workspace)
	shift
	case "$1" in
	list)
		shift
		while [ "$1" != "" ]; do
			case "$1" in
			-R)
				ws="$2"
				if [ -f "${ws}/.jj/forgotten" ]; then
					exit 0
				fi
				printf 'alive: %s\n' "$ws"
				exit 0
				;;
			esac
			shift
		done
		;;
	esac
	;;
esac
exit 1
EOF
	cat >"$STUB_BIN/fzf" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >>"${FZF_LOG:-/dev/null}" 2>/dev/null || true
if [ -n "${FZF_STDIN_LOG:-}" ]; then
	cat >>"$FZF_STDIN_LOG"
else
	cat >/dev/null
fi
if [ -n "${TEST_FZF_SELECT:-}" ]; then
	printf '%s\n' "$TEST_FZF_SELECT"
fi
exit 0
EOF
	cat >"$STUB_BIN/commandline" <<'EOF'
#!/bin/sh
exit 0
EOF
	chmod +x "$STUB_BIN"/{ghq,jj,fzf,commandline}
}

run_ghq_fzf() {
	local extra_args="${*:-}"
	env -i \
		HOME="$HOME" \
		XDG_CONFIG_HOME="$HOME/.config" \
		USER="$USER" \
		LANG=C.UTF-8 \
		PATH="$STUB_BIN:$TOOL_PATH" \
		GHQ_ROOT="$GHQ_ROOT" \
		FZF_LOG="$FZF_LOG" \
		FZF_STDIN_LOG="$FZF_STDIN_LOG" \
		CD_LOG="$CD_LOG" \
		TEST_FZF_SELECT="${TEST_FZF_SELECT:-}" \
		"$FISH_BIN" --no-config -c "
		function cd
			printf '%s\n' \"\$argv\" >>'$CD_LOG'
			builtin cd \$argv
		end
		function commandline
			'$STUB_BIN/commandline' \$argv
		end
		set -gx fish_function_path '$REPO_ROOT/fish/functions' \$fish_function_path
		ghq-fzf $extra_args
	"
}

strip_ansi() {
	"$SD_BIN" '\x1b\[[0-9;]*m' ''
}

trim_trailing_slashes() {
	"$SD_BIN" '/+$' ''
}

cache_body() {
	strip_ansi <"$HOME/.cache/ghq-fzf-list"
}

cache_data_paths() {
	cache_body | rg $'\t' | cut -f2
}

file_mtime() {
	if stat -f %m "$1" 2>/dev/null; then
		return 0
	fi
	stat -c %Y "$1"
}

@test "lists all repositories before linked jj workspaces across hosts" {
	mkdir -p "$GHQ_ROOT/github.com/acme/parent/.jj/repo"
	mkdir -p "$GHQ_ROOT/github.com/acme/myws/.jj"
	printf '%s\n' "$GHQ_ROOT/github.com/acme/parent/.jj/repo" >"$GHQ_ROOT/github.com/acme/myws/.jj/repo"
	mkdir -p "$GHQ_ROOT/github.com/acme/forgotten-ws/.jj"
	printf '%s\n' "$GHQ_ROOT/github.com/acme/parent/.jj/repo" >"$GHQ_ROOT/github.com/acme/forgotten-ws/.jj/repo"
	touch "$GHQ_ROOT/github.com/acme/forgotten-ws/.jj/forgotten"
	mkdir -p "$GHQ_ROOT/github.com/zebra/z-repo/.git"
	mkdir -p "$GHQ_ROOT/gitlab.com/another-owner/gitlab-repo/.git"

	run run_ghq_fzf

	[ "$status" -eq 0 ]
	body="$(cache_body)"
	mapfile -t paths < <(cache_data_paths)
	[ "${#paths[@]}" -eq 4 ]
	[ "${paths[0]}" = "github.com/acme/parent" ]
	[ "${paths[1]}" = "github.com/zebra/z-repo" ]
	[ "${paths[2]}" = "gitlab.com/another-owner/gitlab-repo" ]
	[ "${paths[3]}" = "github.com/acme/myws" ]
	[[ "$body" != *forgotten-ws* ]]
	repos_line="$(printf '%s\n' "$body" | rg -n '── Repositories ──' | cut -d: -f1)"
	ws_line="$(printf '%s\n' "$body" | rg -n '── jj workspaces ──' | cut -d: -f1)"
	[ "$repos_line" -lt "$ws_line" ]
	github_after_ws="$(printf '%s\n' "$body" | awk -v ws="$ws_line" 'NR > ws && /^── github\.com ──/ { print NR; exit }')"
	[ -n "$github_after_ws" ]
	acme_after_ws="$(printf '%s\n' "$body" | awk -v ws="$ws_line" 'NR > ws && /^── acme ──/ { print NR; exit }')"
	[ -n "$acme_after_ws" ]
}

@test "deduplicates main jj root when both .git and .jj markers exist" {
	mkdir -p "$GHQ_ROOT/github.com/acme/dual/.git"
	mkdir -p "$GHQ_ROOT/github.com/acme/dual/.jj/repo"

	run run_ghq_fzf

	[ "$status" -eq 0 ]
	dual_count="$(printf '%s\n' "$(cache_body)" | rg -c 'dual' || true)"
	[ "$dual_count" = "1" ]
}

@test "legacy cache signature without version prefix is regenerated" {
	mkdir -p "$GHQ_ROOT/github.com/acme/only/.git"
	marker_file="$(mktemp)"
	"$FD_BIN" -H -t d -t f -d 5 '^\.(git|jj)$' "$GHQ_ROOT" 2>/dev/null | tr -d '\r' | trim_trailing_slashes | sort >"$marker_file"
	old_sig="$("$SHASUM_BIN" "$marker_file" | awk '{print $1}')"
	printf '%s\n' "$old_sig" >"$HOME/.cache/ghq-fzf-list.sig"
	printf '%s\n' 'stale workspace first' >"$HOME/.cache/ghq-fzf-list"

	run run_ghq_fzf

	[ "$status" -eq 0 ]
	[[ "$(cat "$HOME/.cache/ghq-fzf-list.sig")" != "$old_sig" ]]
	[[ "$(cache_body)" != *"stale workspace first"* ]]
	[[ "$(cache_body)" == *"── Repositories ──"* ]]
}

@test "reuses cache when signature matches on second invocation" {
	mkdir -p "$GHQ_ROOT/github.com/acme/stable/.git"

	run run_ghq_fzf
	[ "$status" -eq 0 ]
	first_sig="$(cat "$HOME/.cache/ghq-fzf-list.sig")"
	touch -t 202001010000 "$HOME/.cache/ghq-fzf-list"
	frozen_mtime="$(file_mtime "$HOME/.cache/ghq-fzf-list")"

	run run_ghq_fzf
	[ "$status" -eq 0 ]
	[ "$(cat "$HOME/.cache/ghq-fzf-list.sig")" = "$first_sig" ]
	[ "$(file_mtime "$HOME/.cache/ghq-fzf-list")" = "$frozen_mtime" ]
}

@test "passes --no-sort to fzf and preserves repo-first order when filtering" {
	mkdir -p "$GHQ_ROOT/github.com/acme/shared-parent/.jj/repo"
	mkdir -p "$GHQ_ROOT/github.com/acme/shared-workspace/.jj"
	printf '%s\n' "$GHQ_ROOT/github.com/acme/shared-parent/.jj/repo" >"$GHQ_ROOT/github.com/acme/shared-workspace/.jj/repo"
	mkdir -p "$GHQ_ROOT/github.com/zebra/zzz-shared/.git"
	rm -f "$FZF_LOG" "$TEST_ROOT/filtered.out"

	run run_ghq_fzf
	[ "$status" -eq 0 ]

	preview_command="ls -l"
	if command -v eza >/dev/null 2>&1; then
		preview_command="eza -TF --level=1 --icons=always"
	fi
	"$REAL_FZF_BIN" --ansi --no-sort --color=fg:-1 --with-nth=1 --nth=1 --delimiter=$'\t' \
		--preview "$preview_command $GHQ_ROOT/{2}" \
		--filter=shared \
		<"$HOME/.cache/ghq-fzf-list" >"$TEST_ROOT/filtered.out"

	mapfile -t filtered_paths < <(strip_ansi <"$TEST_ROOT/filtered.out" | rg $'\t' | cut -f2)
	[ "${#filtered_paths[@]}" -eq 3 ]
	[ "${filtered_paths[0]}" = "github.com/acme/shared-parent" ]
	[ "${filtered_paths[1]}" = "github.com/zebra/zzz-shared" ]
	[ "${filtered_paths[2]}" = "github.com/acme/shared-workspace" ]

	rm -f "$FZF_LOG"
	run run_ghq_fzf
	[ "$status" -eq 0 ]
	run rg -F -- '--no-sort' "$FZF_LOG"
	[ "$status" -eq 0 ]
}

@test "cd uses tab-separated relative path from linked jj workspace selection" {
	mkdir -p "$GHQ_ROOT/github.com/acme/parent/.jj/repo"
	mkdir -p "$GHQ_ROOT/github.com/acme/ws-pick/.jj"
	printf '%s\n' "$GHQ_ROOT/github.com/acme/parent/.jj/repo" >"$GHQ_ROOT/github.com/acme/ws-pick/.jj/repo"

	run run_ghq_fzf
	[ "$status" -eq 0 ]
	ws_row="$(rg 'ws-pick' "$HOME/.cache/ghq-fzf-list" | rg $'\t' | head -1)"
	[ -n "$ws_row" ]

	TEST_FZF_SELECT="$ws_row" run run_ghq_fzf
	[ "$status" -eq 0 ]
	run cat "$CD_LOG"
	[ "$status" -eq 0 ]
	[ "$output" = "$GHQ_ROOT/github.com/acme/ws-pick" ]
}
