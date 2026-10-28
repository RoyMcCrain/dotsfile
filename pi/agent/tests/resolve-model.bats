#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/resolve-model"
	FIXTURES="$BATS_TEST_DIRNAME/fixtures"
	mkdir -p "$TEST_ROOT"

	RESOLVER="$BATS_TEST_DIRNAME/../resolve-model.sh"

	CATALOG="$TEST_ROOT/model-roles.json"
	SETTINGS="$TEST_ROOT/settings.json"
	CODEX="$TEST_ROOT/config.toml"

	export MODEL_ROLES_FILE="$CATALOG"
	export PI_SETTINGS_FILE="$SETTINGS"
	export CODEX_CONFIG_FILE="$CODEX"
}

write_catalog() {
	cat >"$CATALOG" <<'EOF'
{
  "enabledModels": ["provider/pi-model:high", "provider/other:high"],
  "roles": {
    "review.test": { "pi": "provider/pi-model:high", "label": "Pi Model" },
    "impl.cursor": { "cursor": "composer-fast", "label": "Composer Fast" },
    "codex.default": { "id": "gpt-test-model", "label": "Codex Test" }
  }
}
EOF
}

write_settings_drifted() {
	cat >"$SETTINGS" <<'EOF'
{
  "defaultProvider": "openai-codex",
  "defaultModel": "runtime-selected-model",
  "enabledModels": ["provider/stale:high"]
}
EOF
}

write_codex_drifted() {
	cat >"$CODEX" <<'EOF'
model = "stale-model-id"
model_reasoning_effort = "medium"
EOF
}

review_fixture_catalog() {
	cat >"$CATALOG"
}

minimal_path_without_sd() {
	local bin="$TEST_ROOT/minimal-path"
	mkdir -p "$bin"
	ln -sf "$(command -v bash)" "$bin/bash"
	ln -sf "$(command -v jq)" "$bin/jq"
	printf '%s\n' "$bin"
}

@test "resolves .pi for pi roles and .id fallback for codex.default" {
	# Arrange
	write_catalog

	# Act
	run "$RESOLVER" review.test
	[ "$status" -eq 0 ]
	[ "$output" = "provider/pi-model:high" ]

	run "$RESOLVER" codex.default

	# Assert
	[ "$status" -eq 0 ]
	[ "$output" = "gpt-test-model" ]
}

@test "--apply syncs enabledModels and codex model while preserving defaultProvider and defaultModel" {
	# Arrange
	write_catalog
	write_settings_drifted
	write_codex_drifted

	# Act
	run "$RESOLVER" --apply
	[ "$status" -eq 0 ]

	# Assert
	jq -e '.defaultProvider == "openai-codex"' "$SETTINGS" >/dev/null
	jq -e '.defaultModel == "runtime-selected-model"' "$SETTINGS" >/dev/null
	jq -e '.enabledModels == ["provider/pi-model:high", "provider/other:high"]' "$SETTINGS" >/dev/null
	rg -Fq 'model = "gpt-test-model"' "$CODEX"
}

@test "--apply with sd unavailable fails before mutation and reports sd is required" {
	# Arrange
	write_catalog
	write_settings_drifted
	write_codex_drifted

	local settings_before codex_before minimal_path
	settings_before=$(cat "$SETTINGS")
	codex_before=$(cat "$CODEX")
	minimal_path=$(minimal_path_without_sd)

	# Act
	run env PATH="$minimal_path" "$RESOLVER" --apply

	# Assert
	[ "$status" -ne 0 ]
	[[ "$output" == *sd\ is\ required* ]]
	[ "$(cat "$SETTINGS")" = "$settings_before" ]
	[ "$(cat "$CODEX")" = "$codex_before" ]
}

@test "--check reports drift and succeeds after apply" {
	# Arrange
	write_catalog
	write_settings_drifted
	write_codex_drifted

	# Act
	run "$RESOLVER" --check
	[ "$status" -ne 0 ]

	run "$RESOLVER" --apply
	[ "$status" -eq 0 ]

	run "$RESOLVER" --check

	# Assert
	[ "$status" -eq 0 ]
}

write_catalog_with_levels() {
	cat >"$CATALOG" <<'EOF'
{
  "enabledModels": ["provider/pi-model:high"],
  "roles": {
    "review.test": { "pi": "provider/pi-model:high", "label": "Pi Model" },
    "review.antigravity": { "agy": "agy/test-model", "label": "Antigravity Test" },
    "codex.default": { "id": "gpt-test-model", "label": "Codex Test" }
  },
  "reviewTimeouts": {
    "1": { "initial": 45, "retry": 90 },
    "2": { "initial": 180, "retry": 240 }
  },
  "reviewLevels": {
    "1": [
      { "pi": "cursor/fast" },
      { "pi": "anthropic/sonnet:high" },
      { "role": "review.antigravity" }
    ],
    "2": [
      { "pi": "sakana-ai-console/fugu-ultra:high" }
    ]
  }
}
EOF
}

@test "--review-level prints backend, model, initial and retry seconds per reviewer" {
	# Arrange
	write_catalog_with_levels

	# Act
	run "$RESOLVER" --review-level 1

	# Assert
	[ "$status" -eq 0 ]
	[ "${lines[0]}" = "$(printf 'pi	cursor/fast	45	90')" ]
	[ "${lines[1]}" = "$(printf 'pi	anthropic/sonnet:high	45	90')" ]
	[ "${lines[2]}" = "$(printf 'agy	agy/test-model	45	90')" ]
	[ "${#lines[@]}" -eq 3 ]
}

@test "--field cursor resolves .cursor consumer model ids" {
	# Arrange
	write_catalog

	# Act
	run "$RESOLVER" --field cursor impl.cursor

	# Assert
	[ "$status" -eq 0 ]
	[ "$output" = "composer-fast" ]
}

@test "--list includes cursor roles with cursor model ids" {
	# Arrange
	write_catalog

	# Act
	run "$RESOLVER" --list

	# Assert
	[ "$status" -eq 0 ]
	[[ "$output" == *"impl.cursor"$'	'"composer-fast"$'	'"Composer Fast"* ]]
}

@test "--review-level rejects an unknown level" {
	# Arrange
	write_catalog_with_levels

	# Act
	run "$RESOLVER" --review-level 9

	# Assert
	[ "$status" -ne 0 ]
	[[ "$output" == *"unknown review level"* ]]
}

@test "retired Antigravity reviewer role is unavailable in the production catalog" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field agy review.antigravity
	[ "$status" -ne 0 ]
	[[ "$output" == *"unknown model role"* ]]
}

@test "--review-level rejects role reference without agy model" {
	cat >"$CATALOG" <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.bad": { "pi": "provider/pi-only", "label": "Bad" }
  },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": { "1": [ { "role": "review.bad" } ] }
}
EOF

	run "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]
	[[ "$output" == *no\ agy\ model* ]]
}

@test "--review-level rejects non-positive timeout budgets" {
	cat >"$CATALOG" <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.antigravity": { "agy": "agy/test", "label": "Agy" }
  },
  "reviewTimeouts": { "1": { "initial": 0, "retry": 20 } },
  "reviewLevels": { "1": [ { "role": "review.antigravity" } ] }
}
EOF

	run "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]
	[[ "$output" == *invalid\ reviewTimeouts\ budgets* ]]
}

@test "--review-level rejects entries with both pi and role" {
	cat >"$CATALOG" <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.antigravity": { "agy": "agy/test", "label": "Agy" }
  },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": { "1": [ { "pi": "provider/model:high", "role": "review.antigravity" } ] }
}
EOF

	run "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]
	[[ "$output" == *must\ not\ have\ both\ pi\ and\ role* ]]
}

@test "--label falls back to agy model id" {
	cat >"$CATALOG" <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.agy-only": { "agy": "gemini-test-model" }
  }
}
EOF

	run "$RESOLVER" --label review.agy-only
	[ "$status" -eq 0 ]
	[ "$output" = "gemini-test-model" ]
}

@test "each parallel-review catalog entry has a single key (pi, role, or current)" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	jq -e '(.reviewLevels | keys | sort) == ["1", "2"] and (.reviewTimeouts | keys | sort) == ["1", "2"]' "$real_catalog" >/dev/null
	for level in 1 2; do
		jq -e --arg lvl "$level" '
			.reviewLevels[$lvl] as $entries |
			([$entries[] |
				if has("pi") then ("pi:" + .pi)
				elif has("role") then ("role:" + .role)
				elif has("current") then "current"
				else empty end
			] | unique | length == ($entries | length))
		' "$real_catalog" >/dev/null
	done
}

@test "codex apply uses default live path under HOME when CODEX_CONFIG_FILE unset" {
	write_catalog
	write_settings_drifted
	local fake_home="$TEST_ROOT/fake-home"
	local config="$fake_home/.codex/config.toml"
	mkdir -p "$(dirname "$config")"
	cat >"$config" <<'EOF'
model = "stale-model-id"
app_owned = "preserve-me"
EOF

	run env HOME="$fake_home" CODEX_CONFIG_FILE= CODEX_HOME= "$RESOLVER" --apply
	[ "$status" -eq 0 ]
	rg -Fq 'model = "gpt-test-model"' "$config"
	rg -Fq 'app_owned = "preserve-me"' "$config"
}

@test "codex apply respects CODEX_HOME over HOME default" {
	write_catalog
	write_settings_drifted
	local codex_home="$TEST_ROOT/custom-codex"
	local config="$codex_home/config.toml"
	mkdir -p "$codex_home"
	cat >"$config" <<'EOF'
model = "stale-model-id"
EOF

	run env HOME="$TEST_ROOT/unused-home" CODEX_HOME="$codex_home" CODEX_CONFIG_FILE= "$RESOLVER" --apply
	[ "$status" -eq 0 ]
	rg -Fq 'model = "gpt-test-model"' "$config"
	[ ! -f "$TEST_ROOT/unused-home/.codex/config.toml" ]
}

@test "CODEX_CONFIG_FILE overrides CODEX_HOME for codex apply" {
	write_catalog
	write_settings_drifted
	local override="$TEST_ROOT/override/config.toml"
	local codex_home="$TEST_ROOT/custom-codex"
	mkdir -p "$(dirname "$override")" "$codex_home"
	cat >"$override" <<'EOF'
model = "stale-model-id"
EOF
	cat >"$codex_home/config.toml" <<'EOF'
model = "other-stale"
EOF

	run env CODEX_CONFIG_FILE="$override" CODEX_HOME="$codex_home" "$RESOLVER" --apply
	[ "$status" -eq 0 ]
	rg -Fq 'model = "gpt-test-model"' "$override"
	rg -Fq 'model = "other-stale"' "$codex_home/config.toml"
}

@test "codex apply and check do not touch legacy repo codex/config.toml" {
	write_catalog
	write_settings_drifted
	local fake_repo="$TEST_ROOT/fake-repo"
	local fake_home="$TEST_ROOT/fake-home"
	local live="$fake_home/.codex/config.toml"
	local legacy="$fake_repo/codex/config.toml"
	local catalog="$fake_repo/pi/agent/model-roles.json"
	mkdir -p "$(dirname "$live")" "$(dirname "$legacy")" "$(dirname "$catalog")"
	cp "$CATALOG" "$catalog"
	cat >"$live" <<'EOF'
model = "stale-model-id"
app_owned = "preserve-me"
EOF
	cp "$FIXTURES/setup-codex-config/legacy-runtime.toml" "$legacy"
	local legacy_snapshot="$TEST_ROOT/legacy.snapshot"
	cp "$legacy" "$legacy_snapshot"

	run env \
		HOME="$fake_home" \
		CODEX_CONFIG_FILE= \
		CODEX_HOME= \
		MODEL_ROLES_FILE="$catalog" \
		"$RESOLVER" --apply
	[ "$status" -eq 0 ]
	rg -Fq 'model = "gpt-test-model"' "$live"
	rg -Fq 'app_owned = "preserve-me"' "$live"
	cmp -s "$legacy" "$legacy_snapshot"

	printf 'model = "drifted-live-model"\napp_owned = "preserve-me"\n' >"$live"

	run env \
		HOME="$fake_home" \
		CODEX_CONFIG_FILE= \
		CODEX_HOME= \
		MODEL_ROLES_FILE="$catalog" \
		"$RESOLVER" --check
	[ "$status" -ne 0 ]
	cmp -s "$legacy" "$legacy_snapshot"
}

@test "Sonnet 5.5 high/max in catalog; legacy Sonnet 5 scopes are gone" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local sonnet_high="anthropic/claude-sonnet-5-5:high"
	local sonnet_max="anthropic/claude-sonnet-5-5:max"

	jq -e --arg high "$sonnet_high" --arg max "$sonnet_max" \
		'(.enabledModels | index($high) != null) and (.enabledModels | index($max) != null)' \
		"$real_catalog" >/dev/null
	run jq -e '[.enabledModels[] | select(test("anthropic/claude-sonnet-5:"))] | length == 0' \
		"$real_catalog"
	[ "$status" -eq 0 ]
}

@test "GPT-6.1 Sol xhigh/max enabledModels entries are present in catalog" {
	# Arrange — integration against tracked repo catalog
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local sol_xhigh="openai/gpt-6.1-sol:xhigh"
	local sol_max="openai/gpt-6.1-sol:max"

	# Assert — catalog exposes each Sol scope entry exactly once
	jq -e --arg x "$sol_xhigh" --arg m "$sol_max" \
		'(.enabledModels | map(select(. == $x)) | length == 1) and (.enabledModels | map(select(. == $m)) | length == 1)' \
		"$real_catalog" >/dev/null
}

@test "OpenCode Go enabledModels glob is present in catalog" {
	# Arrange — integration against tracked repo catalog
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	# Assert — catalog exposes the provider glob scope
	jq -e '.enabledModels | index("opencode-go/*") != null' "$real_catalog" >/dev/null
}

@test "models.json registers two native Meta Muse models and one Go DeepSeek with caps and compat" {
	# Arrange — integration against tracked models.json, catalog, and enabled scopes
	local real_models="$BATS_TEST_DIRNAME/../models.json"
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	# Assert — Meta provider transport, exactly two native Muse models, and normal Spark capabilities
	jq -e '
		.providers["meta"] as $p |
		($p.api == "openai-responses") and
		($p.baseUrl == "https://api.meta.ai/v1") and
		(($p.models | map(.id) | sort) == (["muse-spark-1.3", "muse-wonder-1.0"] | sort)) and
		($p.models[] | select(.id == "muse-spark-1.3") |
			.reasoning == true and
			(.input | sort) == (["image", "text"] | sort) and
			.contextWindow == 1048576 and
			.maxTokens == 131072 and
			.thinkingLevelMap.high == "high" and
			.thinkingLevelMap.max == "max")
	' "$real_models" >/dev/null

	# Assert — Go provider transport, single DeepSeek model, caps and compat preserved
	jq -e '
		.providers["opencode-go"] as $p |
		($p.api == "openai-completions") and
		($p.baseUrl == "https://opencode.ai/zen/go/v1") and
		($p.models | map(.id)) == ["deepseek-v4.1-flash"] and
		($p.models[0] |
			.reasoning == true and
			(.input | sort) == (["image", "text"] | sort) and
			.contextWindow == 1000000 and
			.maxTokens == 384000 and
			.compat.maxTokensField == "max_tokens" and
			.compat.requiresReasoningContentOnAssistantMessages == true and
			.compat.thinkingFormat == "deepseek")
	' "$real_models" >/dev/null

	# Assert — exact scopes keep older built-in Meta models out of cycling
	jq -e '
		([.enabledModels[] | select(startswith("meta/"))] | sort) ==
		["meta/muse-spark-1.3", "meta/muse-wonder-1.0"]
	' "$real_catalog" >/dev/null
}

@test "--review-level rejects invalid current model and backend" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-model $'openai-codex/gpt-6-astra:high	injected'
	[ "$status" -ne 0 ]

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-model "incomplete-model-without-provider"
	[ "$status" -ne 0 ]

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-backend cursor --current-model "cursor/fast"
	[ "$status" -ne 0 ]
}

@test "review dedupe strips Muse effort off minimal low medium high xhigh max only" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.muse": { "pi": "opencode-go/muse-spark-1.3-contributor:high", "label": "Muse High" },
    "review.antigravity": { "agy": "gemini-3.8-flash-high", "label": "Agy" }
  },
  "reviewTimeouts": { "2": { "initial": 300, "retry": 300 } },
  "reviewLevels": {
    "2": [
      { "role": "review.antigravity" },
      { "pi": "opencode-go/muse-spark-1.3-contributor:high" },
      { "current": true }
    ]
  }
}
EOF
	local muse_high="opencode-go/muse-spark-1.3-contributor:high"
	local agy_model="gemini-3.8-flash-high"

	for effort in low medium minimal off; do
		run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
			"$RESOLVER" --review-level 2 \
			--current-model "opencode-go/muse-spark-1.3-contributor:${effort}"
		[ "$status" -eq 0 ]
		[ "${#lines[@]}" -eq 2 ]
		[ "${lines[0]}" = "$(printf 'agy	%s	300	300' "$agy_model")" ]
		[ "${lines[1]}" = "$(printf 'pi	%s	300	300' "$muse_high")" ]
	done
}

@test "review dedupe does not strip thinking suffix or version tags like 7b" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.muse": { "pi": "opencode-go/muse-spark-1.3-contributor:high", "label": "Muse High" }
  },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": {
    "1": [
      { "pi": "opencode-go/muse-spark-1.3-contributor:high" },
      { "current": true }
    ]
  }
}
EOF
	local muse_high="opencode-go/muse-spark-1.3-contributor:high"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 1 \
		--current-model "opencode-go/muse-spark-1.3-contributor:thinking"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 2 ]

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 1 \
		--current-model "test-provider/some-model-7b:high"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 2 ]
	[ "${lines[0]}" = "$(printf 'pi	%s	10	20' "$muse_high")" ]
	[ "${lines[1]}" = "$(printf 'pi	test-provider/some-model-7b:high	10	20')" ]
}

@test "review dedupe matches max and low Muse efforts against fixed Muse high" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.muse": { "pi": "opencode-go/muse-spark-1.3-contributor:high", "label": "Muse High" }
  },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": {
    "1": [
      { "pi": "opencode-go/muse-spark-1.3-contributor:high" },
      { "current": true }
    ]
  }
}
EOF
	local muse_high="opencode-go/muse-spark-1.3-contributor:high"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 1 \
		--current-model "opencode-go/muse-spark-1.3-contributor:max"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 1 ]
	[ "${lines[0]}" = "$(printf 'pi	%s	10	20' "$muse_high")" ]

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 1 \
		--current-model "opencode-go/muse-spark-1.3-contributor:low"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 1 ]
}

@test "--review-level rejects string boolean and fractional timeout budgets" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": { "review.antigravity": { "agy": "agy/test", "label": "Agy" } },
  "reviewTimeouts": { "1": { "initial": "300", "retry": 20 } },
  "reviewLevels": { "1": [ { "role": "review.antigravity" } ] }
}
EOF
	run "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]

	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": { "review.antigravity": { "agy": "agy/test", "label": "Agy" } },
  "reviewTimeouts": { "1": { "initial": true, "retry": 20 } },
  "reviewLevels": { "1": [ { "role": "review.antigravity" } ] }
}
EOF
	run "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]

	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": { "review.antigravity": { "agy": "agy/test", "label": "Agy" } },
  "reviewTimeouts": { "1": { "initial": 300.5, "retry": 20 } },
  "reviewLevels": { "1": [ { "role": "review.antigravity" } ] }
}
EOF
	run "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]
}

@test "--review-level rejects static pi and agy strings with whitespace or control chars and emits no stdout" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": { "review.test": { "pi": "provider/model:high", "label": "Ok" } },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": { "1": [ { "pi": "provider/bad\nmodel:high" } ] }
}
EOF
	local stdout_file exit_code
	stdout_file="$TEST_ROOT/stdout-pi-bad.txt"
	set +e
	env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 1 >"$stdout_file" 2>/dev/null
	exit_code=$?
	set -e
	[ "$exit_code" -ne 0 ]
	[ ! -s "$stdout_file" ]

	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": { "review.test": { "pi": "provider/model:high", "label": "Ok" } },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": { "1": [ { "pi": "provider/model	:high" } ] }
}
EOF
	stdout_file="$TEST_ROOT/stdout-pi-tab.txt"
	set +e
	env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 1 >"$stdout_file" 2>/dev/null
	exit_code=$?
	set -e
	[ "$exit_code" -ne 0 ]
	[ ! -s "$stdout_file" ]

	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": { "review.bad": { "agy": "agy/bad\nmodel", "label": "Bad" } },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": { "1": [ { "role": "review.bad" } ] }
}
EOF
	stdout_file="$TEST_ROOT/stdout-agy-bad.txt"
	set +e
	"$RESOLVER" --review-level 1 >"$stdout_file" 2>/dev/null
	exit_code=$?
	set -e
	[ "$exit_code" -ne 0 ]
	[ ! -s "$stdout_file" ]
}

@test "--review-level rejects non-string role agy and pi model fields" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": { "review.bad": { "agy": 42, "label": "Bad" } },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": { "1": [ { "role": "review.bad" } ] }
}
EOF
	run "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]

	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": { "review.test": { "pi": "provider/model:high", "label": "Ok" } },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": { "1": [ { "pi": 99 } ] }
}
EOF
	run "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]
}

@test "--review-level emits no stdout when valid entries precede a malformed one" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.antigravity": { "agy": "gemini-test", "label": "Agy" },
    "review.muse": { "pi": "opencode-go/muse-spark-1.3-contributor:high", "label": "Muse" }
  },
  "reviewTimeouts": { "2": { "initial": 10, "retry": 20 } },
  "reviewLevels": {
    "2": [
      { "role": "review.antigravity" },
      { "pi": "opencode-go/muse-spark-1.3-contributor:high" },
      { "bogus": true }
    ]
  }
}
EOF
	local stdout_file stderr_file exit_code
	stdout_file="$TEST_ROOT/stdout.txt"
	stderr_file="$TEST_ROOT/stderr.txt"
	set +e
	env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 2 \
		--current-model "anthropic/claude-sonnet-5:high" \
		>"$stdout_file" 2>"$stderr_file"
	exit_code=$?
	set -e
	[ "$exit_code" -ne 0 ]
	[ ! -s "$stdout_file" ]
	[ -s "$stderr_file" ]
}

@test "--current-backend agy without explicit model rejects and does not use PI env" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.muse": { "pi": "opencode-go/muse-spark-1.3-contributor:high", "label": "Muse" }
  },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": {
    "1": [
      { "pi": "opencode-go/muse-spark-1.3-contributor:high" },
      { "current": true }
    ]
  }
}
EOF
	run env PI_PROVIDER=anthropic PI_MODEL=claude-sonnet-5 PI_REASONING_LEVEL=high \
		"$RESOLVER" --review-level 1 --current-backend agy
	[ "$status" -ne 0 ]

	run env PI_PROVIDER=anthropic PI_MODEL=claude-sonnet-5 \
		"$RESOLVER" --review-level 1 --current-backend unsupported
	[ "$status" -ne 0 ]
}

@test "Pi current provider slash effort only rejects as incomplete model" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-model "openai-codex/:high"
	[ "$status" -ne 0 ]
}

@test "same provider different models are not deduped" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": {
    "review.muse": { "pi": "opencode-go/muse-spark-1.3-contributor:high", "label": "Muse" }
  },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": {
    "1": [
      { "pi": "opencode-go/muse-spark-1.3-contributor:high" },
      { "current": true }
    ]
  }
}
EOF
	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 1 \
		--current-model "opencode-go/another-model:high"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 2 ]
	[ "${lines[0]}" = "$(printf 'pi	opencode-go/muse-spark-1.3-contributor:high	10	20')" ]
	[ "${lines[1]}" = "$(printf 'pi	opencode-go/another-model:high	10	20')" ]
}

@test "--review-level rejects empty reviewLevels list" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": {},
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": { "1": [] }
}
EOF
	run "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]
}

@test "--review-level rejects current:false before a valid pi entry" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": {},
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": {
    "1": [
      { "current": false },
      { "pi": "provider/model:high" }
    ]
  }
}
EOF
	local stdout_file="$TEST_ROOT/stdout-invalid-current.txt"
	local stderr_file="$TEST_ROOT/stderr-invalid-current.txt"
	local exit_code

	set +e
	env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 1 --current-model "provider/caller:high" \
		>"$stdout_file" 2>"$stderr_file"
	exit_code=$?
	set -e
	[ "$exit_code" -ne 0 ]
	[[ "$(<"$stderr_file")" == *"current must be true"* ]]
	[ ! -s "$stdout_file" ]
}

@test "--review-level rejects more than one current marker in a tier" {
	review_fixture_catalog <<'EOF'
{
  "enabledModels": [],
  "roles": { "review.muse": { "pi": "opencode-go/muse:high", "label": "M" } },
  "reviewTimeouts": { "1": { "initial": 10, "retry": 20 } },
  "reviewLevels": {
    "1": [
      { "current": true },
      { "pi": "opencode-go/muse:high" },
      { "current": true }
    ]
  }
}
EOF
	local stdout_file exit_code
	stdout_file="$TEST_ROOT/stdout-dup-current.txt"
	set +e
	env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		"$RESOLVER" --review-level 1 \
		--current-model "test-provider/caller:high" \
		>"$stdout_file" 2>/dev/null
	exit_code=$?
	set -e
	[ "$exit_code" -ne 0 ]
	[ ! -s "$stdout_file" ]
}

@test "production catalog resolves impl.default to Luna high for Pi" {
	export MODEL_ROLES_FILE="$BATS_TEST_DIRNAME/../model-roles.json"
	run "$RESOLVER" impl.default
	[ "$status" -eq 0 ]
	[ "$output" = "openai/gpt-6-luna:high" ]
}

@test "production catalog resolves impl.deepseek for Pi" {
	export MODEL_ROLES_FILE="$BATS_TEST_DIRNAME/../model-roles.json"
	run "$RESOLVER" impl.deepseek
	[ "$status" -eq 0 ]
	[ "$output" = "opencode-go/deepseek-v4.1-flash:high" ]
}

@test "production catalog resolves impl.haiku for Pi" {
	export MODEL_ROLES_FILE="$BATS_TEST_DIRNAME/../model-roles.json"
	run "$RESOLVER" impl.haiku
	[ "$status" -eq 0 ]
	[ "$output" = "opencode-go/claude-haiku-5-5:high" ]
}

@test "production catalog has no impl.cursor role" {
	export MODEL_ROLES_FILE="$BATS_TEST_DIRNAME/../model-roles.json"
	run "$RESOLVER" --field cursor impl.cursor
	[ "$status" -ne 0 ]
	[[ "$output" == *"unknown model role"* ]]
}

@test "production --check verifies settings/catalog enabledModels synchronization" {
	export MODEL_ROLES_FILE="$BATS_TEST_DIRNAME/../model-roles.json"
	export PI_SETTINGS_FILE="$BATS_TEST_DIRNAME/../settings.json"
	export CODEX_CONFIG_FILE="$BATS_TEST_TMPDIR/no-codex-config.toml"
	run "$RESOLVER" --check
	[ "$status" -eq 0 ]
	jq -e '.enabledModels | index("openai/gpt-6-luna:high") != null' "$MODEL_ROLES_FILE" >/dev/null
}

@test "auth.json.example wires opencode-go command auth without enabling opencode Zen" {
	# Arrange — tracked auth example only (no live auth or Keychain)
	local auth_example="$BATS_TEST_DIRNAME/../auth.json.example"
	local expected_cmd='!security find-generic-password -w -s open-code-go-api-key'

	# Assert — Sakana command reference remains intact
	jq -e '
		.["sakana-ai-console"].type == "api_key" and
		.["sakana-ai-console"].key == "!security find-generic-password -w -s fugu-api-key"
	' "$auth_example" >/dev/null

	# Assert — OpenCode Go uses provider-scoped command auth (not shared OPENCODE_API_KEY)
	jq -e --arg cmd "$expected_cmd" '
		.["opencode-go"].type == "api_key" and
		.["opencode-go"].key == $cmd
	' "$auth_example" >/dev/null

	# Assert — Zen provider and env-based Zen auth are not introduced
	jq -e 'has("opencode") | not' "$auth_example" >/dev/null
	run jq -e '[.. | strings | select(test("OPENCODE_API_KEY"))] | length == 0' "$auth_example"
	[ "$status" -eq 0 ]
}

@test "production catalog resolves exactly Codex then Claude for every tier regardless of caller" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	jq -e '(.reviewLevels | keys | sort) == ["1", "2"] and (.reviewTimeouts | keys | sort) == ["1", "2"]' "$real_catalog" >/dev/null
	export MODEL_ROLES_FILE="$real_catalog"
	for level in 1 2; do
		for caller in codex muse; do
			if [ "$caller" = "codex" ]; then
				run env -u PI_PROVIDER -u PI_MODEL "$RESOLVER" --review-level "$level"
			else
				run env PI_PROVIDER=meta PI_MODEL=muse-spark-1.3:high "$RESOLVER" --review-level "$level"
			fi
			[ "$status" -eq 0 ]
			local lines=()
			mapfile -t lines <<<"$output"
			[ "${#lines[@]}" -eq 2 ]
			[[ "${lines[0]}" == $'pi	'* ]]
			[[ "${lines[1]}" == $'pi	'* ]]
			local codex="${lines[0]#*$'	'}"
			local claude="${lines[1]#*$'	'}"
			codex="${codex%%$'	'*}"
			claude="${claude%%$'	'*}"
			case "$level" in
			1)
				[ "$codex" = "openai/gpt-6.1-sol:xhigh" ] && [ "$claude" = "anthropic/claude-opus-5-5:high" ]
				[ "${lines[0]}" = "$(printf 'pi\topenai/gpt-6.1-sol:xhigh\t600\t600')" ]
				[ "${lines[1]}" = "$(printf 'pi\tanthropic/claude-opus-5-5:high\t600\t600')" ]
				;;
			2)
				[ "$codex" = "openai/gpt-6-astra:max" ] && [ "$claude" = "anthropic/claude-opus-5-5:max" ]
				[ "${lines[0]}" = "$(printf 'pi\topenai/gpt-6-astra:max\t600\t900')" ]
				[ "${lines[1]}" = "$(printf 'pi\tanthropic/claude-opus-5-5:max\t600\t900')" ]
				;;
			esac
		done
	done
	for level in 3 4 5; do
		run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level "$level"
		[ "$status" -ne 0 ]
		[[ "$output" == *"unknown review level"* ]]
	done
}
@test "Fugu integration restored with fugu-max and fugu-ultra-v2.0" {
	# Arrange — integration against tracked repo catalog, settings, models, codex
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_settings="$BATS_TEST_DIRNAME/../settings.json"
	local real_models="$BATS_TEST_DIRNAME/../models.json"
	local codex_fugu="$BATS_TEST_DIRNAME/../../../codex/fugu.json"
	local base_model="sakana-ai-console/fugu-max:high"
	local ultra_model="sakana-ai-console/fugu-ultra-v2.0:high"

	# Assert — catalog enables both Fugu pair entries
	jq -e --arg base "$base_model" --arg ultra "$ultra_model" \
		'(.enabledModels | index($base) != null) and (.enabledModels | index($ultra) != null)' \
		"$real_catalog" >/dev/null

	# Assert — review.fugu resolves to ultra v2 :high with timeout 240
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.fugu
	[ "$status" -eq 0 ]
	[ "$output" = "$ultra_model" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field timeout review.fugu
	[ "$status" -eq 0 ]
	[ "$output" = "240" ]

	# Assert — route roles expose raw model IDs for extension consumption
	jq -e '.roles["route.fugu.base"].id == "fugu-max"' "$real_catalog" >/dev/null
	jq -e '.roles["route.fugu.ultra"].id == "fugu-ultra-v2.0"' "$real_catalog" >/dev/null

	# Assert — sakana provider transport and caps in models.json
	jq -e '
		.providers["sakana-ai-console"] as $provider |
		($provider.baseUrl == "https://api.sakana.ai/v1") and
		($provider.api == "openai-responses") and
		($provider.models | map(.id) | sort) == (["fugu-max", "fugu-ultra-v2.0"] | sort) and
		($provider.models[] | select(.id == "fugu-max") | .contextWindow == 300000 and .maxTokens == 32768) and
		($provider.models[] | select(.id == "fugu-ultra-v2.0") | .contextWindow == 300000 and .maxTokens == 8192)
	' "$real_models" >/dev/null

	# Assert — both models share the same supported/unsupported thinking levels
	for model_id in fugu-max fugu-ultra-v2.0; do
		jq -e --arg id "$model_id" '
			.providers["sakana-ai-console"].models[] | select(.id == $id) |
			(.thinkingLevelMap.off == null) and
			(.thinkingLevelMap.minimal == null) and
			(.thinkingLevelMap.low == null) and
			(.thinkingLevelMap.medium == null) and
			(.thinkingLevelMap.high == "high") and
			(.thinkingLevelMap.xhigh == "xhigh") and
			(.thinkingLevelMap.max == "max")
		' "$real_models" >/dev/null
	done

	# Assert — Codex fugu profile template defaults to Max
	local fugu_profile="$BATS_TEST_DIRNAME/../../../codex/fugu.config.toml.example"
	taplo fmt --check - <"$fugu_profile" >/dev/null
	[ "$(taplo get -f "$fugu_profile" model)" = "fugu-max" ]
	[ "$(taplo get -f "$fugu_profile" model_providers.sakana.base_url)" = "https://api.sakana.ai/v1" ]

	# Assert — auto-fugu-model extension is active (not force-excluded)
	run jq -e '.extensions | index("-extensions/auto-fugu-model.ts") == null' "$real_settings"
	[ "$status" -eq 0 ]

	# Assert — Codex fugu.json registry uses new slugs
	jq -e '
		[.models[].slug] | sort == (["fugu-max", "fugu-ultra-v2.0"] | sort)
	' "$codex_fugu" >/dev/null

	# Assert — no legacy active model IDs (fugu / fugu-ultra without version)
	run jq -e '[.. | strings | select(. == "sakana-ai-console/fugu:high" or . == "sakana-ai-console/fugu-ultra:high")] | length == 0' \
		"$real_catalog"
	[ "$status" -eq 0 ]
	run jq -e '[.providers["sakana-ai-console"].models[].id | select(. == "fugu" or . == "fugu-ultra")] | length == 0' \
		"$real_models"
	[ "$status" -eq 0 ]
}

@test "Opus 5.5 high/max and standalone Claude role remain enabled" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_settings="$BATS_TEST_DIRNAME/../settings.json"
	local opus_high="anthropic/claude-opus-5-5:high"
	local opus_max="anthropic/claude-opus-5-5:max"
	jq -e --arg high "$opus_high" --arg max "$opus_max" '(.enabledModels | index($high) != null) and (.enabledModels | index($max) != null)' "$real_catalog" >/dev/null
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.claude
	[ "$status" -eq 0 ]
	[ "$output" = "$opus_high" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --label review.claude
	[ "$status" -eq 0 ]
	[ "$output" = "Claude Opus 5.5 High" ]
	jq -e '[.. | strings | select(test("anthropic/claude-opus-5:"))] | length == 0' "$real_catalog" >/dev/null
	jq -e '[.. | strings | select(test("anthropic/claude-opus-5:"))] | length == 0' "$real_settings" >/dev/null
}

@test "Astra default and standalone Codex role remain separate from review tiers" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_models="$BATS_TEST_DIRNAME/../models.json"
	local codex_id
	codex_id=$(jq -r '.roles["codex.default"].id' "$real_catalog")
	[ "$codex_id" = "gpt-6-astra" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.codex
	[ "$status" -eq 0 ]
	[ "$output" = "openai/gpt-6-astra:high" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --label review.codex
	[ "$status" -eq 0 ]
	[[ "$output" == *"High"* ]]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" codex.default
	[ "$status" -eq 0 ]
	[ "$output" = "$codex_id" ]
	jq -e --arg id "$codex_id" --arg sol "gpt-6.1-sol" '(.providers.openai.modelOverrides[$id].contextWindow == 500000) and (.providers.openai.modelOverrides[$sol].contextWindow == 500000) and ((.providers.openai.modelOverrides | keys | sort) == ([$id, $sol] | sort))' "$real_models" >/dev/null
	jq -e '[.. | strings | select(startswith("openai-codex/"))] | length == 0' "$real_catalog" >/dev/null
	jq -e '[.enabledModels[] | select(startswith("openai/"))] | length == 5' "$real_catalog" >/dev/null
}

@test "review.muse standalone role, DeepSeek, shared skill, and Claude symlink remain protected" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local muse_skill="$BATS_TEST_DIRNAME/../../../skills/muse-review/SKILL.md"
	local claude_link="$BATS_TEST_DIRNAME/../../../claude/skills/muse-review"
	local repo_root
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse
	[ "$status" -eq 0 ]
	[ "$output" = "meta/muse-spark-1.3:high" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field timeout review.muse
	[ "$status" -eq 0 ]
	[ "$output" = "120" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --label review.muse
	[ "$status" -eq 0 ]
	[[ "$output" == *"Muse Spark 1.3 High"* ]]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.deepseek
	[ "$status" -eq 0 ]
	[ "$output" = "opencode-go/deepseek-v4.1-flash:high" ]
	[ -f "$muse_skill" ]
	rg -Fq 'review.muse' "$muse_skill"
	repo_root=$(cd "$BATS_TEST_DIRNAME/../../.." && pwd -P)
	run bash "$repo_root/scripts/build_env/list_shared_agent_skills.sh" "$repo_root"
	[ "$status" -eq 0 ]
	[[ $'\n'"$output"$'\n' == *$'\n'"$repo_root/skills/muse-review"$'\n'* ]]
	[ -L "$claude_link" ]
	[ "$(readlink "$claude_link")" = "../../skills/muse-review" ]
}

@test "review.grok standalone role resolves, times out, and remains enabled" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.grok
	[ "$status" -eq 0 ]
	[ "$output" = "xai/grok-4.7" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field timeout review.grok
	[ "$status" -eq 0 ]
	[ "$output" = "120" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" research.xai
	[ "$status" -eq 0 ]
	[ "$output" = "xai/grok-4.7" ]
	jq -e '.enabledModels | index("xai/grok-4.7") != null' "$real_catalog" >/dev/null
}
