#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

FIXTURES="$BATS_TEST_DIRNAME/fixtures/setup-codex-config"

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/setup-codex"
	HOME="$TEST_ROOT/home"
	ROOT="$TEST_ROOT/repo"
	CODEX_DIR="$HOME/.codex"
	mkdir -p "$HOME" "$ROOT/codex" "$ROOT/pi/agent"

	HELPER="$BATS_TEST_DIRNAME/../../../scripts/build_env/setup_codex_config.sh"
	RESOLVER_SRC="$BATS_TEST_DIRNAME/../resolve-model.sh"
	TEMPLATE_SRC="$BATS_TEST_DIRNAME/../../../codex/config.toml.example"

	cp "$RESOLVER_SRC" "$ROOT/pi/agent/resolve-model.sh"
	chmod +x "$ROOT/pi/agent/resolve-model.sh"
	cp "$TEMPLATE_SRC" "$ROOT/codex/config.toml.example"

	export HOME
	unset CODEX_HOME CODEX_CONFIG_FILE MODEL_ROLES_FILE
}

file_mode() {
	stat -c '%a' "$1" 2>/dev/null || stat -f '%OLp' "$1"
}

assert_no_config_temp() {
	local dir=$1
	local leftover
	leftover=$(fd -H -I --glob 'config.toml.*' "$dir")
	[ -z "$leftover" ]
}

assert_no_setup_leaks() {
	local dir=$1
	local leftover
	assert_no_config_temp "$dir"
	leftover=$(fd -H -I --glob '.config-setup.*' "$dir")
	[ -z "$leftover" ]
	[ ! -e "$dir/.config-setup.lock" ]
}

snapshot_link_content() {
	local link=$1 snapshot=$2
	cp -L "$link" "$snapshot"
	[ ! -L "$snapshot" ]
	[[ ! "$snapshot" -ef "$link" ]]
}

assert_directory_empty() {
	local dir=$1
	local leftover
	leftover=$(fd -H -I . "$dir")
	[ -z "$leftover" ]
}

write_catalog() {
	cat >"$ROOT/pi/agent/model-roles.json" <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "codex.default": { "id": "gpt-test-catalog-model", "label": "Codex Test" }
  }
}
EOF
}

target_config() {
	printf '%s\n' "${CODEX_HOME:-$HOME/.codex}/config.toml"
}

legacy_fixture() {
	cp "$FIXTURES/legacy-runtime.toml" "$ROOT/codex/config.toml"
}

make_stub_bin() {
	local bin="$TEST_ROOT/stub-bin"
	mkdir -p "$bin"
	printf '%s\n' "$bin"
}

@test "first install creates mode-600 file with catalog model and template fields" {
	write_catalog
	mkdir -p "$(dirname "$(target_config)")"

	run bash "$HELPER" "$ROOT"
	[ "$status" -eq 0 ]

	local config
	config=$(target_config)
	[ -f "$config" ]
	[ ! -L "$config" ]
	[[ "$(file_mode "$config")" == "600" ]]

	run bash -c 'taplo get -f "$1" -o json model | jq -r .' bash "$config"
	[ "$status" -eq 0 ]
	[ "$output" = "gpt-test-catalog-model" ]

	run bash -c 'taplo get -f "$1" -o json approval_policy | jq -r .' bash "$config"
	[ "$status" -eq 0 ]
	[ "$output" = "never" ]

	run bash -c 'taplo get -f "$1" -o json "features.hooks" | jq -r .' bash "$config"
	[ "$status" -eq 0 ]
	[ "$output" = "true" ]

	run taplo get -f "$config" -o json notify 2>/dev/null
	[ "$status" -ne 0 ]

	run taplo get -f "$config" -o json projects 2>/dev/null
	[ "$status" -ne 0 ]

	run taplo get -f "$config" -o json node_repl 2>/dev/null
	[ "$status" -ne 0 ]

	run bash -c 'taplo get -f "$1" -o json "mcp_servers.devin.url" | jq -r .' bash "$config"
	[ "$status" -eq 0 ]
	[ "$output" = "https://mcp.devin.ai/mcp" ]

	run bash -c 'taplo get -f "$1" -o json mcp_servers | jq "keys | length"' bash "$config"
	[ "$status" -eq 0 ]
	[ "$output" = "1" ]

	run taplo get -f "$ROOT/codex/config.toml.example" model
	[ "$status" -ne 0 ]

	run taplo check "$config"
	[ "$status" -eq 0 ]
}

@test "second run preserves user edits byte-for-byte" {
	write_catalog
	mkdir -p "$(dirname "$(target_config)")"

	bash "$HELPER" "$ROOT"
	local config
	config=$(target_config)
	printf '\nuser_edit = "keep-me"\n\n\n' >>"$config"
	local snapshot="$TEST_ROOT/after-edit.toml"
	cp "$config" "$snapshot"

	run bash "$HELPER" "$ROOT"
	[ "$status" -eq 0 ]
	cmp -s "$config" "$snapshot"
}

@test "pre-existing regular file is left untouched including permissions" {
	write_catalog
	mkdir -p "$CODEX_DIR"
	local config="$CODEX_DIR/config.toml"
	cp "$FIXTURES/pre-existing-regular.toml" "$config"
	chmod 644 "$config"
	local snapshot="$TEST_ROOT/pre-existing.snapshot"
	cp "$config" "$snapshot"
	local perms_before
	perms_before=$(file_mode "$config")

	run bash "$HELPER" "$ROOT"
	[ "$status" -eq 0 ]
	cmp -s "$config" "$snapshot"
	[[ "$(file_mode "$config")" == "$perms_before" ]]
}

@test "pre-existing regular file preserved without template resolver or catalog" {
	mkdir -p "$CODEX_DIR"
	local config="$CODEX_DIR/config.toml"
	cp "$FIXTURES/pre-existing-regular.toml" "$config"
	chmod 644 "$config"
	local snapshot="$TEST_ROOT/pre-existing-no-deps.snapshot"
	cp "$config" "$snapshot"

	rm -f "$ROOT/codex/config.toml.example"
	rm -f "$ROOT/pi/agent/model-roles.json"
	rm -f "$ROOT/pi/agent/resolve-model.sh"

	run bash "$HELPER" "$ROOT"
	[ "$status" -eq 0 ]
	cmp -s "$config" "$snapshot"
	[[ "$(file_mode "$config")" == "644" ]]
}

@test "default setup refuses legacy symlink without mutation" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local link="$CODEX_DIR/config.toml"
	local snapshot="$TEST_ROOT/legacy-before.snapshot"
	snapshot_link_content "$link" "$snapshot"
	local link_target
	link_target=$(readlink "$link")

	run bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[[ "$output" == *"--migrate-legacy"* ]]
	[ -L "$link" ]
	[[ "$(readlink "$link")" == "$link_target" ]]
	cmp -s "$link" "$snapshot"
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "default setup refuses legacy symlink even with simulated app writer hook" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local legacy="$ROOT/codex/config.toml"

	local stub_bin real_chmod
	stub_bin=$(make_stub_bin)
	real_chmod=$(command -v chmod)
	cat >"$stub_bin/chmod" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
"$REAL_CHMOD" "$@"
printf 'model = "after-save"\n' > "$CODEX_HOME/config.toml"
STUB
	chmod +x "$stub_bin/chmod"

	run env PATH="$stub_bin:$PATH" REAL_CHMOD="$real_chmod" CODEX_HOME="$CODEX_DIR" bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[ -L "$CODEX_DIR/config.toml" ]
	rg -Fq 'app-runtime-model' "$legacy"
	rg -Fq 'after-save' "$legacy" && exit 1 || true
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "legacy absolute symlink migrates to regular file with exact content" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"

	run bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -eq 0 ]

	local config="$CODEX_DIR/config.toml"
	[ -f "$config" ]
	[ ! -L "$config" ]
	cmp -s "$config" "$FIXTURES/legacy-runtime.toml"
	[[ "$(file_mode "$config")" == "600" ]]
	cmp -s "$ROOT/codex/config.toml" "$FIXTURES/legacy-runtime.toml"
}

@test "legacy relative symlink migrates to regular file with exact content" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	ln -sf "../../repo/codex/config.toml" "$CODEX_DIR/config.toml"

	run bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -eq 0 ]

	local config="$CODEX_DIR/config.toml"
	[ -f "$config" ]
	[ ! -L "$config" ]
	cmp -s "$config" "$FIXTURES/legacy-runtime.toml"
}

@test "migration survives mv publication failure and cleans owned temp" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local link="$CODEX_DIR/config.toml"
	local snapshot="$TEST_ROOT/link-before.snapshot"
	local link_target
	link_target=$(readlink "$link")
	snapshot_link_content "$link" "$snapshot"

	local stub_bin
	stub_bin=$(make_stub_bin)
	cat >"$stub_bin/mv" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
	chmod +x "$stub_bin/mv"

	run env PATH="$stub_bin:$PATH" bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -ne 0 ]
	[ -L "$link" ]
	[[ "$(readlink "$link")" == "$link_target" ]]
	cmp -s "$link" "$snapshot"
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "migration aborts when legacy source changes during copy" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local link="$CODEX_DIR/config.toml"
	local legacy="$ROOT/codex/config.toml"

	local stub_bin real_cp
	stub_bin=$(make_stub_bin)
	real_cp=$(command -v cp)
	cat >"$stub_bin/cp" <<STUB
#!/usr/bin/env bash
"$real_cp" "\$@"
if [[ "\${@: -1}" == */.config-setup.*/config.toml ]]; then
	printf '\nmutated-during-copy\n' >>"$legacy"
fi
STUB
	chmod +x "$stub_bin/cp"

	run env PATH="$stub_bin:$PATH" bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -ne 0 ]
	[ -L "$link" ]
	rg -Fq 'app-runtime-model' "$legacy"
	rg -Fq 'mutated-during-copy' "$legacy"
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "migration aborts when symlink target changes during copy" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local link="$CODEX_DIR/config.toml"
	local other="$TEST_ROOT/other/config.toml"
	mkdir -p "$(dirname "$other")"
	cp "$FIXTURES/legacy-runtime.toml" "$other"

	local stub_bin real_cp
	stub_bin=$(make_stub_bin)
	real_cp=$(command -v cp)
	cat >"$stub_bin/cp" <<STUB
#!/usr/bin/env bash
"$real_cp" "\$@"
ln -sf "$other" "$link"
STUB
	chmod +x "$stub_bin/cp"

	run env PATH="$stub_bin:$PATH" bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -ne 0 ]
	[[ "$(readlink "$link")" == "$other" ]]
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "explicit migration detects late app save during staging chmod" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	export CODEX_HOME="$CODEX_DIR"
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local legacy="$ROOT/codex/config.toml"

	local stub_bin real_chmod
	stub_bin=$(make_stub_bin)
	real_chmod=$(command -v chmod)
	cat >"$stub_bin/chmod" <<STUB
#!/usr/bin/env bash
"$real_chmod" "\$@"
if [[ "\${@: -1}" == */.config-setup.*/config.toml ]]; then
	printf 'model = "after-save"\n' > "$CODEX_HOME/config.toml"
fi
STUB
	chmod +x "$stub_bin/chmod"

	run env PATH="$stub_bin:$PATH" REAL_CHMOD="$real_chmod" CODEX_HOME="$CODEX_DIR" bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -ne 0 ]
	[ -L "$CODEX_DIR/config.toml" ]
	rg -Fq 'after-save' "$legacy"
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "explicit migration detects atomic save replacing symlink during staging chmod" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	export CODEX_HOME="$CODEX_DIR"
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local link="$CODEX_DIR/config.toml"

	local stub_bin real_chmod real_mv
	stub_bin=$(make_stub_bin)
	real_chmod=$(command -v chmod)
	real_mv=$(command -v mv)
	cat >"$stub_bin/chmod" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
"$REAL_CHMOD" "$@"
if [[ "${@: -1}" == */.config-setup.*/config.toml ]]; then
	printf 'model = "after-save"\n' > "$CODEX_HOME/new-config.toml"
	"$REAL_MV" -f "$CODEX_HOME/new-config.toml" "$CODEX_HOME/config.toml"
fi
STUB
	chmod +x "$stub_bin/chmod"

	run env PATH="$stub_bin:$PATH" REAL_CHMOD="$real_chmod" REAL_MV="$real_mv" CODEX_HOME="$CODEX_DIR" bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -ne 0 ]
	[ -f "$link" ]
	[ ! -L "$link" ]
	rg -Fq 'after-save' "$link"
	rg -Fq 'after-save' "$ROOT/codex/config.toml" && exit 1 || true
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "explicit migration with no target refuses default initialization" {
	write_catalog
	mkdir -p "$CODEX_DIR"

	run bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -ne 0 ]
	[ ! -e "$CODEX_DIR/config.toml" ]
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "concurrent writer during install preserves runtime config and fails" {
	write_catalog
	mkdir -p "$CODEX_DIR"
	local config="$CODEX_DIR/config.toml"

	local stub_bin real_ln
	stub_bin=$(make_stub_bin)
	real_ln=$(command -v ln)
	cat >"$stub_bin/ln" <<STUB
#!/usr/bin/env bash
printf 'concurrent = "writer"\n' >"$config"
exec "$real_ln" "\$@"
STUB
	chmod +x "$stub_bin/ln"

	run env PATH="$stub_bin:$PATH" bash "$HELPER" "$ROOT"
	cmp -s "$config" <(printf 'concurrent = "writer"\n')
	[ "$status" -ne 0 ]
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "install rejects concurrent config directory collision" {
	write_catalog
	mkdir -p "$CODEX_DIR"

	local stub_bin real_ln
	stub_bin=$(make_stub_bin)
	real_ln=$(command -v ln)
	cat >"$stub_bin/ln" <<STUB
#!/usr/bin/env bash
mkdir -p "$CODEX_DIR/config.toml"
exec "$real_ln" "\$@"
STUB
	chmod +x "$stub_bin/ln"

	run env PATH="$stub_bin:$PATH" bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[ -d "$CODEX_DIR/config.toml" ]
	assert_directory_empty "$CODEX_DIR/config.toml"
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "install rejects concurrent directory-symlink collision" {
	write_catalog
	mkdir -p "$CODEX_DIR"
	local collision="$TEST_ROOT/other-directory"
	mkdir -p "$collision"

	local stub_bin real_ln
	stub_bin=$(make_stub_bin)
	real_ln=$(command -v ln)
	cat >"$stub_bin/ln" <<STUB
#!/usr/bin/env bash
"$real_ln" -s "$collision" "$CODEX_DIR/config.toml"
exec "$real_ln" "\$@"
STUB
	chmod +x "$stub_bin/ln"

	run env PATH="$stub_bin:$PATH" bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[ -L "$CODEX_DIR/config.toml" ]
	[ -d "$CODEX_DIR/config.toml" ]
	assert_directory_empty "$collision"
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "unrelated symlink is preserved even when legacy repo file is missing" {
	write_catalog
	mkdir -p "$CODEX_DIR"
	local other="$TEST_ROOT/other/config.toml"
	mkdir -p "$(dirname "$other")"
	printf 'model = "elsewhere"\n' >"$other"
	ln -sf "$other" "$CODEX_DIR/config.toml"
	rm -f "$ROOT/codex/config.toml"

	run bash "$HELPER" "$ROOT"
	[ "$status" -eq 0 ]

	[ -L "$CODEX_DIR/config.toml" ]
	[[ "$(readlink "$CODEX_DIR/config.toml")" == "$other" ]]
}

@test "symlink to directory is rejected" {
	write_catalog
	mkdir -p "$CODEX_DIR"
	local dir_target="$TEST_ROOT/config-dir"
	mkdir -p "$dir_target"
	ln -sf "$dir_target" "$CODEX_DIR/config.toml"

	run bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[ -L "$CODEX_DIR/config.toml" ]
	[ -d "$CODEX_DIR/config.toml" ]
}

@test "broken symlink is rejected without creating config" {
	write_catalog
	mkdir -p "$CODEX_DIR"
	ln -sf "$ROOT/codex/missing-config.toml" "$CODEX_DIR/config.toml"

	run bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[ -L "$CODEX_DIR/config.toml" ]
	[ ! -f "$CODEX_DIR/config.toml" ]
}

@test "directory at target is rejected unchanged" {
	write_catalog
	mkdir -p "$CODEX_DIR/config.toml"

	run bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[ -d "$CODEX_DIR/config.toml" ]
}

@test "missing template leaves no config" {
	write_catalog
	rm -f "$ROOT/codex/config.toml.example"
	mkdir -p "$CODEX_DIR"

	run bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[ ! -e "$CODEX_DIR/config.toml" ]
}

@test "failed model resolution leaves no config" {
	write_catalog
	jq 'del(.roles["codex.default"])' "$ROOT/pi/agent/model-roles.json" >"$ROOT/pi/agent/model-roles.json.tmp"
	mv "$ROOT/pi/agent/model-roles.json.tmp" "$ROOT/pi/agent/model-roles.json"
	mkdir -p "$CODEX_DIR"

	run bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[ ! -e "$CODEX_DIR/config.toml" ]
}

@test "CODEX_HOME selects install target" {
	write_catalog
	export CODEX_HOME="$TEST_ROOT/custom-codex-home"
	mkdir -p "$CODEX_HOME"

	run bash "$HELPER" "$ROOT"
	[ "$status" -eq 0 ]

	local config="$CODEX_HOME/config.toml"
	[ -f "$config" ]
	run bash -c 'taplo get -f "$1" -o json model | jq -r .' bash "$config"
	[ "$status" -eq 0 ]
	[ "$output" = "gpt-test-catalog-model" ]
}

@test "repo root path with spaces is handled" {
	write_catalog
	local spaced_root="$TEST_ROOT/spaced repo root"
	mkdir -p "$spaced_root/codex" "$spaced_root/pi/agent"
	cp "$ROOT/codex/config.toml.example" "$spaced_root/codex/"
	cp "$ROOT/pi/agent/resolve-model.sh" "$spaced_root/pi/agent/"
	cp "$ROOT/pi/agent/model-roles.json" "$spaced_root/pi/agent/"
	chmod +x "$spaced_root/pi/agent/resolve-model.sh"
	mkdir -p "$CODEX_DIR"

	run bash "$HELPER" "$spaced_root"
	[ "$status" -eq 0 ]
	[ -f "$CODEX_DIR/config.toml" ]
}

@test "explicit migration refuses absent legacy source without template init" {
	write_catalog
	mkdir -p "$CODEX_DIR"
	ln -sf "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"

	run bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -ne 0 ]
	[ -L "$CODEX_DIR/config.toml" ]
	[ ! -f "$CODEX_DIR/config.toml" ]
	assert_no_setup_leaks "$CODEX_DIR"
}

@test "explicit migration on existing regular file remains idempotent" {
	write_catalog
	mkdir -p "$CODEX_DIR"
	local config="$CODEX_DIR/config.toml"
	cp "$FIXTURES/pre-existing-regular.toml" "$config"
	chmod 644 "$config"
	local snapshot="$TEST_ROOT/migrated-regular.snapshot"
	cp "$config" "$snapshot"

	run bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -eq 0 ]
	cmp -s "$config" "$snapshot"
	[[ "$(file_mode "$config")" == "644" ]]
}

@test "lock contention preserves settings and unowned lock" {
	write_catalog
	mkdir -p "$CODEX_DIR"
	mkdir "$CODEX_DIR/.config-setup.lock"

	run bash "$HELPER" "$ROOT"
	[ "$status" -ne 0 ]
	[ ! -e "$CODEX_DIR/config.toml" ]
	[ -d "$CODEX_DIR/.config-setup.lock" ]
}

@test "explicit migration lock contention preserves legacy settings and unowned lock" {
	write_catalog
	legacy_fixture
	mkdir -p "$CODEX_DIR"
	mkdir "$CODEX_DIR/.config-setup.lock"
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local legacy="$ROOT/codex/config.toml"
	local snapshot="$TEST_ROOT/legacy-lock.snapshot"
	cp -L "$legacy" "$snapshot"

	run bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -ne 0 ]
	[ -L "$CODEX_DIR/config.toml" ]
	cmp -s "$legacy" "$snapshot"
	[ -d "$CODEX_DIR/.config-setup.lock" ]
	assert_no_config_temp "$CODEX_DIR"
	local stage_dirs
	stage_dirs=$(fd -H -I -t d --glob '.config-setup.??????' "$CODEX_DIR")
	[ -z "$stage_dirs" ]
}

@test "owned lock is released on success and failure" {
	write_catalog
	mkdir -p "$CODEX_DIR"

	bash "$HELPER" "$ROOT"
	[ ! -e "$CODEX_DIR/.config-setup.lock" ]

	legacy_fixture
	ln -sf "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local stub_bin
	stub_bin=$(make_stub_bin)
	cat >"$stub_bin/mv" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
	chmod +x "$stub_bin/mv"

	run env PATH="$stub_bin:$PATH" bash "$HELPER" --migrate-legacy "$ROOT"
	[ "$status" -ne 0 ]
	[ ! -e "$CODEX_DIR/.config-setup.lock" ]
}

@test "migrate-legacy works outside checkout without template or resolver" {
	mkdir -p "$CODEX_DIR"
	legacy_fixture
	ln -s "$ROOT/codex/config.toml" "$CODEX_DIR/config.toml"
	local external_helper="$TEST_ROOT/external-setup_codex_config.sh"
	cp "$HELPER" "$external_helper"
	rm -f "$ROOT/codex/config.toml.example"
	rm -f "$ROOT/pi/agent/model-roles.json"
	rm -f "$ROOT/pi/agent/resolve-model.sh"

	run bash "$external_helper" --migrate-legacy "$ROOT"
	[ "$status" -eq 0 ]

	local config="$CODEX_DIR/config.toml"
	[ -f "$config" ]
	[ ! -L "$config" ]
	cmp -s "$config" "$FIXTURES/legacy-runtime.toml"
}

@test "help and invalid options fail without mutation" {
	write_catalog
	mkdir -p "$CODEX_DIR"

	run bash "$HELPER" --help
	[ "$status" -eq 0 ]
	[[ "$output" == *"--migrate-legacy"* ]]

	run bash "$HELPER" --unknown "$ROOT"
	[ "$status" -ne 0 ]

	run bash "$HELPER" "$ROOT" "$ROOT"
	[ "$status" -ne 0 ]
}

@test "pre-update jj lifecycle migrates before tracked legacy removal" {
	local jj_root="$TEST_ROOT/jj-fixture"
	local vcs_home="$TEST_ROOT/jj-vcs-home"
	local app_home="$TEST_ROOT/jj-app-home"
	local external_helper="$TEST_ROOT/jj-extracted-helper.sh"
	mkdir -p "$jj_root" "$vcs_home/.config" "$app_home/.codex"

	fixture_jj() {
		env HOME="$vcs_home" XDG_CONFIG_HOME="$vcs_home/.config" JJ_EDITOR=true \
			jj --repository "$jj_root" --config 'user.name="Review Fixture"' \
			--config 'user.email="fixture@example.invalid"' "$@"
	}

	env HOME="$vcs_home" XDG_CONFIG_HOME="$vcs_home/.config" JJ_EDITOR=true \
		jj git init --no-colocate "$jj_root"

	mkdir -p "$jj_root/codex"
	cp "$FIXTURES/legacy-runtime.toml" "$jj_root/codex/config.toml"
	fixture_jj describe -m 'Old tracked config'
	local old
	old=$(fixture_jj log -r @ --no-graph -T commit_id)

	fixture_jj new
	mkdir -p "$jj_root/scripts/build_env"
	cp "$HELPER" "$jj_root/scripts/build_env/setup_codex_config.sh"
	printf '/codex/config.toml\n' >"$jj_root/.gitignore"
	fixture_jj file untrack 'root:codex/config.toml'
	local new
	new=$(fixture_jj log -r @ --no-graph -T commit_id)
	[ -f "$jj_root/scripts/build_env/setup_codex_config.sh" ]

	fixture_jj new "$old"
	[ -f "$jj_root/codex/config.toml" ]
	[ ! -e "$jj_root/scripts/build_env/setup_codex_config.sh" ]
	ln -s "$jj_root/codex/config.toml" "$app_home/.codex/config.toml"
	local backup="$TEST_ROOT/jj-pre-migrate-backup.toml"
	cp -L "$app_home/.codex/config.toml" "$backup"
	chmod 600 "$backup"

	(
		cd "$jj_root"
		fixture_jj file show -r "$new" scripts/build_env/setup_codex_config.sh
	) >"$external_helper"
	chmod +x "$external_helper"
	[[ -s "$external_helper" ]]
	env HOME="$app_home" CODEX_HOME="$app_home/.codex" \
		bash "$external_helper" --migrate-legacy "$jj_root"
	local config="$app_home/.codex/config.toml"
	[ -f "$config" ]
	[ ! -L "$config" ]
	cmp -s "$config" "$backup"

	fixture_jj new "$new"
	[ ! -e "$jj_root/codex/config.toml" ]
	[ -L "$app_home/.codex/config.toml" ] && exit 1 || true
	[ -f "$config" ]
	cmp -s "$config" "$backup"

	run env HOME="$app_home" CODEX_HOME="$app_home/.codex" bash "$HELPER" "$jj_root"
	[ "$status" -eq 0 ]
	cmp -s "$config" "$backup"
}
