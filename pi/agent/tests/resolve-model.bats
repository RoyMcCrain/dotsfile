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

minimal_path_without_sd() {
	local bin="$TEST_ROOT/minimal-path"
	mkdir -p "$bin"
	ln -sf "$(command -v bash)" "$bin/bash"
	ln -sf "$(command -v jq)" "$bin/jq"
	printf '%s\n' "$bin"
}

@test "production catalog resolves route.review id field" {
	export MODEL_ROLES_FILE="$BATS_TEST_DIRNAME/../model-roles.json"
	run "$RESOLVER" --field id route.review
	[ "$status" -eq 0 ]
	[ "$output" = "typesafe/jev-1.13" ]
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
	[ "${lines[0]}" = "$(printf 'pi\tcursor/fast\t45\t90')" ]
	[ "${lines[1]}" = "$(printf 'pi\tanthropic/sonnet:high\t45\t90')" ]
	[ "${lines[2]}" = "$(printf 'agy\tagy/test-model\t45\t90')" ]
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
	[[ "$output" == *"impl.cursor"$'\t'"composer-fast"$'\t'"Composer Fast"* ]]
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

@test "Fugu integration restored with fugu-max and fugu-ultra-v2.0" {
	# Arrange — integration against tracked repo catalog, settings, models, codex
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_settings="$BATS_TEST_DIRNAME/../settings.json"
	local real_models="$BATS_TEST_DIRNAME/../models.json"
	local codex_fugu="$BATS_TEST_DIRNAME/../../../codex/fugu.json"
	local base_model="sakana-ai-console/fugu-max:high"
	local ultra_model="sakana-ai-console/fugu-ultra-v2.0:high"

	# Assert — enabledModels includes both Fugu pair entries
	jq -e --arg base "$base_model" --arg ultra "$ultra_model" \
		'(.enabledModels | index($base) != null) and (.enabledModels | index($ultra) != null)' \
		"$real_catalog" >/dev/null
	jq -e --arg base "$base_model" --arg ultra "$ultra_model" \
		'(.enabledModels | index($base) != null) and (.enabledModels | index($ultra) != null)' \
		"$real_settings" >/dev/null

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

	# Assert — L1/L2 dynamic (no static Fugu); L3/L4 Fugu Max; L5 Fugu Ultra v2
	jq -e \
		'[.reviewLevels["1"][] | select(has("pi")) | select(.pi | startswith("sakana-ai-console/"))] | length == 0' \
		"$real_catalog" >/dev/null
	jq -e \
		'[.reviewLevels["2"][] | select(has("pi")) | select(.pi | startswith("sakana-ai-console/"))] | length == 0' \
		"$real_catalog" >/dev/null
	jq -e --arg base "$base_model" \
		'[.reviewLevels["3"][] | .pi? // empty | select(startswith("sakana-ai-console/"))] == [$base]' \
		"$real_catalog" >/dev/null
	jq -e --arg base "$base_model" \
		'[.reviewLevels["4"][] | .pi? // empty | select(startswith("sakana-ai-console/"))] == [$base]' \
		"$real_catalog" >/dev/null
	jq -e --arg ultra "$ultra_model" \
		'[.reviewLevels["5"][] | .pi? // empty | select(startswith("sakana-ai-console/"))] == [$ultra]' \
		"$real_catalog" >/dev/null

	# Assert — catalog entry counts (L1/L2 include current marker)
	jq -e '.reviewLevels["1"] | length == 2' "$real_catalog" >/dev/null
	jq -e '.reviewLevels["2"] | length == 3' "$real_catalog" >/dev/null
	jq -e '.reviewLevels["3"] | length == 6' "$real_catalog" >/dev/null
	jq -e '.reviewLevels["4"] | length == 6' "$real_catalog" >/dev/null
	jq -e '.reviewLevels["5"] | length == 6' "$real_catalog" >/dev/null

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

@test "--review-level 3 emits six rows with Fugu Max fifth and Muse sixth (legacy L2)" {
	# Arrange — integration against the tracked repo catalog
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local base_slug max_model muse_model

	base_slug="$(jq -r '.roles["route.fugu.base"].id' "$real_catalog")"
	max_model="$(jq -r --arg slug "$base_slug" \
		'.enabledModels[] | select(startswith("sakana-ai-console/" + $slug + ":"))' \
		"$real_catalog")"
	muse_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse)"
	[ -n "$max_model" ]
	[ -n "$muse_model" ]

	# Act
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 3

	# Assert
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 6 ]
	[ "${lines[4]}" = "$(printf 'pi\t%s\t600\t600' "$max_model")" ]
	[ "${lines[5]}" = "$(printf 'pi\t%s\t600\t600' "$muse_model")" ]
}

@test "review.grok resolves and appears exactly once in parallel-review L3 through L5" {
	# Arrange — integration against the tracked repo catalog
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_settings="$BATS_TEST_DIRNAME/../settings.json"
	local grok_model

	# Act
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.grok

	# Assert
	[ "$status" -eq 0 ]
	[ "$output" = "xai/grok-4.7" ]
	grok_model="$output"

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field timeout review.grok
	[ "$status" -eq 0 ]
	[ "$output" = "120" ]

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" research.xai
	[ "$status" -eq 0 ]
	[ "$output" = "$grok_model" ]

	jq -e --arg model "$grok_model" \
		'[.enabledModels[] | select(startswith("xai/"))] == [$model]' \
		"$real_catalog" >/dev/null
	jq -e --arg model "$grok_model" \
		'[.enabledModels[] | select(startswith("xai/"))] == [$model]' \
		"$real_settings" >/dev/null

	for level in 3 4 5; do
		jq -e --arg model "$grok_model" --arg lvl "$level" \
			'(.reviewLevels[$lvl] | map(select(has("pi")) | .pi) | map(select(. == $model)) | length) == 1' \
			"$real_catalog" >/dev/null
	done
}

@test "reviewTimeouts and reviewLevels match parallel-review catalog" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local -a expected_timeouts=(
		$'1\t300\t300'
		$'2\t300\t300'
		$'3\t600\t600'
		$'4\t600\t900'
		$'5\t600\t900'
	)
	local line level initial retry

	for line in "${expected_timeouts[@]}"; do
		IFS=$'\t' read -r level initial retry <<<"$line"
		jq -e --arg lvl "$level" --argjson initial "$initial" --argjson retry "$retry" \
			'.reviewTimeouts[$lvl].initial == $initial and .reviewTimeouts[$lvl].retry == $retry' \
			"$real_catalog" >/dev/null
	done

	jq -e '[.reviewLevels[][]] | all(
		(has("pi") or has("role") or (has("current") and .current == true)) and
		(. | keys | length == 1)
	)' \
		"$real_catalog" >/dev/null

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 5
	[ "$status" -eq 0 ]
	[ "${lines[0]}" = "$(printf 'pi\txai/grok-4.7\t600\t900')" ]
	[ "${lines[3]}" = "$(printf 'agy\tgemini-3.8-flash-high\t600\t900')" ]
}

@test "review.antigravity resolves with --field agy and fails default Pi resolution" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field agy review.antigravity
	[ "$status" -eq 0 ]
	[ "$output" = "gemini-3.8-flash-high" ]

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.antigravity
	[ "$status" -ne 0 ]
	[[ "$output" == *has\ no\ model\ id* ]]
}

@test "--list includes agy roles with agy model ids" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --list
	[ "$status" -eq 0 ]
	[[ "$output" == *"review.antigravity"$'\t'"gemini-3.8-flash-high"$'\t'"Gemini 3.8 Flash High (Antigravity)"* ]]
}

@test "review.antigravity appears exactly once in parallel-review L2 through L5" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	for level in 2 3 4 5; do
		jq -e --arg lvl "$level" \
			'[.reviewLevels[$lvl][] | select(has("role") and .role == "review.antigravity")] | length == 1' \
			"$real_catalog" >/dev/null
	done
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

	for level in 1 2 3 4 5; do
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

@test "Opus 5.5 high/max in catalog, settings, review.claude, and parallel-review L3/L4/L5" {
	# Arrange — integration against the tracked repo catalog and settings
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_settings="$BATS_TEST_DIRNAME/../settings.json"
	local opus_high="anthropic/claude-opus-5-5:high"
	local opus_max="anthropic/claude-opus-5-5:max"

	# Assert — enabledModels includes Opus 5.5 high/max in catalog and settings
	jq -e --arg high "$opus_high" --arg max "$opus_max" \
		'(.enabledModels | index($high) != null) and (.enabledModels | index($max) != null)' \
		"$real_catalog" >/dev/null
	jq -e --arg high "$opus_high" --arg max "$opus_max" \
		'(.enabledModels | index($high) != null) and (.enabledModels | index($max) != null)' \
		"$real_settings" >/dev/null

	# Assert — review.claude resolves to Opus 5.5 :high with expected label
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.claude
	[ "$status" -eq 0 ]
	[ "$output" = "$opus_high" ]

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --label review.claude
	[ "$status" -eq 0 ]
	[ "$output" = "Claude Opus 5.5 High" ]

	# Assert — L3 Opus :high; L4/L5 Opus :max
	jq -e --arg high "$opus_high" \
		'[.reviewLevels["3"][] | select(has("pi")) | select(.pi | startswith("anthropic/claude-opus-5-5:")) | .pi][0] == $high' \
		"$real_catalog" >/dev/null
	jq -e --arg max "$opus_max" \
		'[.reviewLevels["4"][] | select(has("pi")) | select(.pi | startswith("anthropic/claude-opus-5-5:")) | .pi][0] == $max' \
		"$real_catalog" >/dev/null
	jq -e --arg max "$opus_max" \
		'[.reviewLevels["5"][] | select(has("pi")) | select(.pi | startswith("anthropic/claude-opus-5-5:")) | .pi][0] == $max' \
		"$real_catalog" >/dev/null

	# Assert — --review-level emits Opus 5.5 rows at L3/L5
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 3
	[ "$status" -eq 0 ]
	[ "${lines[2]}" = "$(printf 'pi\t%s\t600\t600' "$opus_high")" ]

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 5
	[ "$status" -eq 0 ]
	[ "${lines[2]}" = "$(printf 'pi\t%s\t600\t900' "$opus_max")" ]

	# Assert — no legacy Opus 5 model ids remain in active catalog/settings
	run jq -e '[.. | strings | select(test("anthropic/claude-opus-5:"))] | length == 0' \
		"$real_catalog"
	[ "$status" -eq 0 ]
	run jq -e '[.. | strings | select(test("anthropic/claude-opus-5:"))] | length == 0' \
		"$real_settings"
	[ "$status" -eq 0 ]
}

@test "Astra default, review.codex, and parallel-review Codex tier split (L3 Sol xhigh, L4/L5 Astra max)" {
	# Arrange — integration against the tracked repo catalog
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_models="$BATS_TEST_DIRNAME/../models.json"
	local codex_id astra_pi astra_max sol_xhigh

	codex_id=$(jq -r '.roles["codex.default"].id' "$real_catalog")
	astra_pi="openai-codex/gpt-6-astra"
	astra_max="${astra_pi}:max"
	sol_xhigh="openai-codex/gpt-6.1-sol:xhigh"

	# Assert — codex.default remains Astra; enabledModels keeps Astra xhigh/max scopes
	[ "$codex_id" = "gpt-6-astra" ]
	jq -e --arg x "${astra_pi}:xhigh" --arg m "$astra_max" \
		'(.enabledModels | index($x) != null) and (.enabledModels | index($m) != null)' \
		"$real_catalog" >/dev/null

	# Assert — standalone review.codex stays Astra :high (independent of parallel-review tier routing)
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.codex
	[ "$status" -eq 0 ]
	[ "$output" = "${astra_pi}:high" ]

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --label review.codex
	[ "$status" -eq 0 ]
	[[ "$output" == *"High"* ]]

	# Assert — catalog pins L3 to Sol 6.1 xhigh and L4/L5 to Astra max
	jq -e --arg model "$sol_xhigh" \
		'[.reviewLevels["3"][] | select(has("pi")) | select(.pi | startswith("openai-codex/")) | .pi] == [$model]' \
		"$real_catalog" >/dev/null
	jq -e --arg model "$astra_max" \
		'[.reviewLevels["4"][] | select(has("pi")) | select(.pi | startswith("openai-codex/")) | .pi] == [$model]' \
		"$real_catalog" >/dev/null
	jq -e --arg model "$astra_max" \
		'[.reviewLevels["5"][] | select(has("pi")) | select(.pi | startswith("openai-codex/")) | .pi] == [$model]' \
		"$real_catalog" >/dev/null

	# Assert — --review-level emits exactly one Codex row per static tier with tier budgets
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 3
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 6 ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t600\t600' "$sol_xhigh")" ]

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 4
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 6 ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t600\t900' "$astra_max")" ]

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 5
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 6 ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t600\t900' "$astra_max")" ]

	# Assert — codex.default resolves to the catalog id (no provider/thinking suffix)
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" codex.default
	[ "$status" -eq 0 ]
	[ "$output" = "$codex_id" ]

	# Assert — active codex.default model override carries 372K context window
	jq -e --arg model "$codex_id" \
		'(.providers["openai-codex"].modelOverrides // {}) as $overrides |
		 ($overrides | has($model)) and
		 ($overrides[$model].contextWindow == 372000) and
		 (($overrides | keys) | all(. == $model))' \
		"$real_models" >/dev/null

	# Assert — no legacy GPT-5 model ids remain in the role catalog
	run jq -e '[.. | strings | select(test("gpt-5"))] | length == 0' "$real_catalog"
	[ "$status" -eq 0 ]
}

@test "GPT-6.1 Sol xhigh/max enabledModels entries are present in catalog and synced settings" {
	# Arrange — integration against tracked repo catalog and settings
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_settings="$BATS_TEST_DIRNAME/../settings.json"
	local sol_xhigh="openai-codex/gpt-6.1-sol:xhigh"
	local sol_max="openai-codex/gpt-6.1-sol:max"

	# Assert — catalog and settings expose each Sol scope entry exactly once
	jq -e --arg x "$sol_xhigh" --arg m "$sol_max" \
		'(.enabledModels | map(select(. == $x)) | length == 1) and (.enabledModels | map(select(. == $m)) | length == 1)' \
		"$real_catalog" >/dev/null
	jq -e --arg x "$sol_xhigh" --arg m "$sol_max" \
		'(.enabledModels | map(select(. == $x)) | length == 1) and (.enabledModels | map(select(. == $m)) | length == 1)' \
		"$real_settings" >/dev/null

	# Assert — settings enabledModels mirror the catalog (resolve-model --apply output)
	jq -e --slurpfile catalog "$real_catalog" '.enabledModels == $catalog[0].enabledModels' \
		"$real_settings" >/dev/null
}

@test "OpenCode Go enabledModels glob is present in catalog and synced settings" {
	# Arrange — integration against tracked repo catalog and settings
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_settings="$BATS_TEST_DIRNAME/../settings.json"

	# Assert — catalog and settings both expose the provider glob scope
	jq -e '.enabledModels | index("opencode-go/*") != null' "$real_catalog" >/dev/null
	jq -e '.enabledModels | index("opencode-go/*") != null' "$real_settings" >/dev/null

	# Assert — settings enabledModels mirror the catalog (resolve-model --apply output)
	jq -e --slurpfile catalog "$real_catalog" '.enabledModels == $catalog[0].enabledModels' \
		"$real_settings" >/dev/null
}

@test "review.muse resolves with timeout 120 and appears once per parallel-review tier with tier budgets" {
	# Arrange — integration against the tracked repo catalog
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local muse_model skill_path claude_link level line
	local -a expected_budgets=(
		$'3\t600\t600'
		$'4\t600\t900'
		$'5\t600\t900'
	)
	skill_path="$BATS_TEST_DIRNAME/../../../skills/muse-review/SKILL.md"
	claude_link="$BATS_TEST_DIRNAME/../../../claude/skills/muse-review"

	# Assert — review.muse resolves to Muse Contributor High with timeout 120 (standalone)
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse
	[ "$status" -eq 0 ]
	muse_model="$output"
	[ "$muse_model" = "opencode-go/muse-spark-1.3-contributor:high" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field timeout review.muse
	[ "$status" -eq 0 ]
	[ "$output" = "120" ]
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --label review.muse
	[ "$status" -eq 0 ]
	[[ "$output" == *"Muse Spark 1.3 Contributor High"* ]]

	# Assert — each tier has exactly one opencode-go entry equal to roles.review.muse.pi
	for level in 1 2 3 4 5; do
		jq -e --arg model "$muse_model" --arg lvl "$level" '
			(.reviewLevels[$lvl] | map(select(has("pi")) | select(.pi | startswith("opencode-go/")) | .pi)) == [$model]
		' "$real_catalog" >/dev/null
		jq -e --arg lvl "$level" \
			'[.reviewLevels[$lvl][] | select(.role? == "review.muse")] | length == 0' \
			"$real_catalog" >/dev/null
	done

	# Assert — resolve-model --review-level emits Muse last with tier budgets on static tiers
	for line in "${expected_budgets[@]}"; do
		local lvl initial retry
		IFS=$'\t' read -r lvl initial retry <<<"$line"
		run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level "$lvl"
		[ "$status" -eq 0 ]
		[ "${lines[-1]}" = "$(printf 'pi\t%s\t%s\t%s' "$muse_model" "$initial" "$retry")" ]
	done

	# Assert — dynamic L1/L2 include Muse with 300/300 when caller differs
	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-model "openai-codex/gpt-6-astra:high"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 2 ]
	[ "${lines[-1]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]

	# Assert — skill resolves via role only (no literal model id in SKILL.md)
	[ -f "$skill_path" ]
	run rg -Fq 'review.muse' "$skill_path"
	[ "$status" -eq 0 ]
	run rg -Fq "$muse_model" "$skill_path"
	[ "$status" -ne 0 ]
	run rg -Fq 'muse-spark-1.3-contributor' "$skill_path"
	[ "$status" -ne 0 ]
	run rg -Fq '`parallel-review` には含めない' "$skill_path"
	[ "$status" -ne 0 ]

	# Assert — shared inventory discovers the skill without a manual inventory entry
	local repo_root
	repo_root=$(cd "$BATS_TEST_DIRNAME/../../.." && pwd -P)
	run bash "$repo_root/scripts/build_env/list_shared_agent_skills.sh" "$repo_root"
	[ "$status" -eq 0 ]
	[[ $'\n'"$output"$'\n' == *$'\n'"$repo_root/skills/muse-review"$'\n'* ]]

	# Assert — Claude symlink follows shared skill convention
	[ -L "$claude_link" ]
	[ "$(readlink "$claude_link")" = "../../skills/muse-review" ]
}

@test "--review-level 1 fails without current model context" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1
	[ "$status" -ne 0 ]
	[[ "$output" == *current\ model* ]]
}

@test "--review-level 1 uses PI_PROVIDER PI_MODEL and optional PI_REASONING_LEVEL" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local muse_model
	muse_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse)"

	run env -u PI_REASONING_LEVEL \
		PI_PROVIDER=anthropic PI_MODEL=claude-sonnet-5 PI_REASONING_LEVEL=max \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 2 ]
	[ "${lines[0]}" = "$(printf 'pi\tanthropic/claude-sonnet-5:max\t300\t300')" ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]
}

@test "--review-level 1 dedupes to one row when caller is Muse" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local muse_model
	muse_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse)"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-model "$muse_model"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 1 ]
	[ "${lines[0]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]
}

@test "--review-level 2 dedupes caller against Muse and Antigravity Gemini" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local muse_model agy_model
	muse_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse)"
	agy_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field agy review.antigravity)"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 2 \
		--current-model "$muse_model"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 2 ]
	[ "${lines[0]}" = "$(printf 'agy\t%s\t300\t300' "$agy_model")" ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 2 \
		--current-backend agy --current-model "$agy_model"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 2 ]
	[ "${lines[0]}" = "$(printf 'agy\t%s\t300\t300' "$agy_model")" ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]
}

@test "--review-level rejects invalid current model and backend" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-model $'openai-codex/gpt-6-astra:high\tinjected'
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

@test "--review-level 4 uses Astra max for Codex and Opus max while keeping Fugu Max" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local base_slug max_model opus_max codex_max
	base_slug="$(jq -r '.roles["route.fugu.base"].id' "$real_catalog")"
	max_model="$(jq -r --arg slug "$base_slug" \
		'.enabledModels[] | select(startswith("sakana-ai-console/" + $slug + ":"))' \
		"$real_catalog")"
	opus_max="anthropic/claude-opus-5-5:max"
	codex_max="openai-codex/gpt-6-astra:max"

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 4
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 6 ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t600\t900' "$codex_max")" ]
	[ "${lines[2]}" = "$(printf 'pi\t%s\t600\t900' "$opus_max")" ]
	[ "${lines[4]}" = "$(printf 'pi\t%s\t600\t900' "$max_model")" ]
}

review_fixture_catalog() {
	cat >"$CATALOG"
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
		[ "${lines[0]}" = "$(printf 'agy\t%s\t300\t300' "$agy_model")" ]
		[ "${lines[1]}" = "$(printf 'pi\t%s\t300\t300' "$muse_high")" ]
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
	[ "${lines[0]}" = "$(printf 'pi\t%s\t10\t20' "$muse_high")" ]
	[ "${lines[1]}" = "$(printf 'pi\ttest-provider/some-model-7b:high\t10\t20')" ]
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
	[ "${lines[0]}" = "$(printf 'pi\t%s\t10\t20' "$muse_high")" ]

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
  "reviewLevels": { "1": [ { "pi": "provider/model\t:high" } ] }
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

@test "explicit --current-model overrides PI env including effort" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local muse_model
	muse_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse)"

	run env PI_PROVIDER=anthropic PI_MODEL=claude-sonnet-5 PI_REASONING_LEVEL=max \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-model "openai-codex/gpt-6-astra:high"
	[ "$status" -eq 0 ]
	[ "${lines[0]}" = "$(printf 'pi\topenai-codex/gpt-6-astra:high\t300\t300')" ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]
}

@test "--review-level L2 yields three rows for two different caller providers" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local muse_model agy_model
	muse_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse)"
	agy_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field agy review.antigravity)"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 2 \
		--current-model "openai-codex/gpt-6-astra:high"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 3 ]
	[ "${lines[0]}" = "$(printf 'pi\topenai-codex/gpt-6-astra:high\t300\t300')" ]
	[ "${lines[1]}" = "$(printf 'agy\t%s\t300\t300' "$agy_model")" ]
	[ "${lines[2]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 2 \
		--current-model "anthropic/claude-sonnet-5:high"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 3 ]
}

@test "--review-level uses PI env without PI_REASONING_LEVEL when effort omitted" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local muse_model
	muse_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse)"

	run env -u PI_REASONING_LEVEL \
		PI_PROVIDER=openai-codex PI_MODEL=gpt-6-astra \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1
	[ "$status" -eq 0 ]
	[ "${lines[0]}" = "$(printf 'pi\topenai-codex/gpt-6-astra\t300\t300')" ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]
}

@test "Pi current provider slash effort only rejects as incomplete model" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-model "openai-codex/:high"
	[ "$status" -ne 0 ]
}

@test "cross-backend Pi current with exact agy id dedupes Antigravity Gemini entry" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local agy_model muse_model
	agy_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field agy review.antigravity)"
	muse_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse)"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 2 \
		--current-model "google/${agy_model}:high"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 2 ]
	[ "${lines[0]}" = "$(printf 'agy\t%s\t300\t300' "$agy_model")" ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]
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
	[ "${lines[0]}" = "$(printf 'pi\topencode-go/muse-spark-1.3-contributor:high\t10\t20')" ]
	[ "${lines[1]}" = "$(printf 'pi\topencode-go/another-model:high\t10\t20')" ]
}

@test "--review-level 3 resolves without PI env" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 3
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 6 ]
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

@test "reviewLevels catalog shape all() rejects invalid current:false before valid pi" {
	# Arrange — first entry invalid; stream jq -e without all() only checks the last row
	local bad='{"reviewLevels":{"x":[{"current":false},{"pi":"provider/model:high"}],"y":[{"pi":"provider/last:high"}]}}'

	# Assert — every entry in every tier must pass, not just the final tier
	run jq -e '[.reviewLevels[][]] | all(
		(has("pi") or has("role") or (has("current") and .current == true)) and
		(. | keys | length == 1)
	)' <<<"$bad"
	[ "$status" -ne 0 ]

	# Assert — legacy per-entry stream predicate false-positive (documents jq -e last-row behavior)
	run jq -e '.reviewLevels | to_entries[] | .value[] |
		(has("pi") or has("role") or (has("current") and .current == true)) and
		(. | keys | length == 1)' <<<"$bad"
	[ "$status" -eq 0 ]
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

@test "--review-level validates explicit --current-model on static tiers without changing roster" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local stdout_file exit_code
	stdout_file="$TEST_ROOT/stdout-l3-bad-current.txt"

	# Assert — malformed explicit current fails with zero stdout even when tier ignores PI env
	set +e
	env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 3 \
		--current-model $'bad\tmodel' >"$stdout_file" 2>/dev/null
	exit_code=$?
	set -e
	[ "$exit_code" -ne 0 ]
	[ ! -s "$stdout_file" ]

	# Assert — valid explicit current on L3 leaves static six-row roster unchanged
	run env -u PI_PROVIDER -u PI_MODEL -u PI_REASONING_LEVEL \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 3 \
		--current-model "openai-codex/gpt-6-astra:high"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 6 ]

	run env PI_PROVIDER=$'bad\tprovider' PI_MODEL=$'bad\tmodel' PI_REASONING_LEVEL=bogus \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 3 \
		--current-model "openai-codex/gpt-6-astra:high"
	[ "$status" -eq 0 ]
	[ "${#lines[@]}" -eq 6 ]
}

@test "PI_PROVIDER must not contain slash; PI_MODEL may use namespaces and colon tags" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local muse_model stdout_file exit_code
	muse_model="$(env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.muse)"
	stdout_file="$TEST_ROOT/stdout-bad-pi-provider.txt"

	# Assert — slash in PI_PROVIDER is rejected before assembly (zero stdout)
	set +e
	env PI_PROVIDER=bad/provider PI_MODEL=model MODEL_ROLES_FILE="$real_catalog" \
		"$RESOLVER" --review-level 1 >"$stdout_file" 2>/dev/null
	exit_code=$?
	set -e
	[ "$exit_code" -ne 0 ]
	[ ! -s "$stdout_file" ]

	# Assert — namespaced PI_MODEL with literal colon tag and known reasoning effort
	run env -u PI_REASONING_LEVEL \
		PI_PROVIDER=test-provider PI_MODEL=namespace/model:7b PI_REASONING_LEVEL=high \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1
	[ "$status" -eq 0 ]
	[ "${lines[0]}" = "$(printf 'pi\ttest-provider/namespace/model:7b:high\t300\t300')" ]
	[ "${lines[1]}" = "$(printf 'pi\t%s\t300\t300' "$muse_model")" ]
}

@test "--review-level rejects malformed PI env with zero stdout on dynamic tiers" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local stdout_file exit_code

	assert_pi_env_fails() {
		stdout_file="$TEST_ROOT/stdout-pi-env-$1.txt"
		shift
		set +e
		env "$@" MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
			>"$stdout_file" 2>/dev/null
		exit_code=$?
		set -e
		[ "$exit_code" -ne 0 ]
		[ ! -s "$stdout_file" ]
	}

	# Arrange / Act / Assert — table-driven malformed PI env (implementation may already reject)
	assert_pi_env_fails tab-model -u PI_REASONING_LEVEL \
		PI_PROVIDER=anthropic PI_MODEL=$'claude\tmodel'
	assert_pi_env_fails newline-model -u PI_REASONING_LEVEL \
		PI_PROVIDER=anthropic PI_MODEL=$'claude\nmodel'
	assert_pi_env_fails ws-provider -u PI_REASONING_LEVEL \
		"PI_PROVIDER=bad provider" PI_MODEL=model
	assert_pi_env_fails bogus-reasoning \
		PI_PROVIDER=anthropic PI_MODEL=claude-sonnet-5 PI_REASONING_LEVEL=bogus

	# Assert — explicit valid current ignores malformed PI env
	run env PI_PROVIDER=$'bad\tprovider' PI_MODEL=$'bad\tmodel' PI_REASONING_LEVEL=bogus \
		MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 1 \
		--current-model "openai-codex/gpt-6-astra:high"
	[ "$status" -eq 0 ]
	[ "${lines[0]}" = "$(printf 'pi\topenai-codex/gpt-6-astra:high\t300\t300')" ]
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
