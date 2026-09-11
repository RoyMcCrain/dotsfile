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

	# Assert — L1/L2 have no Fugu; L3 has exactly one Fugu reviewer
	for level in 1 2; do
		jq -e --arg lvl "$level" \
			'[.reviewLevels[$lvl][] | select(has("pi")) | select(.pi | startswith("sakana-ai-console/"))] | length == 0' \
			"$real_catalog" >/dev/null
	done
	jq -e --arg ultra "$ultra_model" \
		'[.reviewLevels["3"][] | select(has("pi")) | select(.pi == $ultra)] | length == 1' \
		"$real_catalog" >/dev/null

	# Assert — tier counts 4/4/5
	for level in 1 2; do
		jq -e --arg lvl "$level" '.reviewLevels[$lvl] | length == 4' "$real_catalog" >/dev/null
	done
	jq -e '.reviewLevels["3"] | length == 5' "$real_catalog" >/dev/null

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

@test "review.grok resolves and appears exactly once in every parallel-review level" {
	# Arrange — integration against the tracked repo catalog
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local grok_model

	# Act
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.grok

	# Assert
	[ "$status" -eq 0 ]
	[ "$output" = "xai/grok-4.6" ]
	grok_model="$output"

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --field timeout review.grok
	[ "$status" -eq 0 ]
	[ "$output" = "120" ]

	for level in 1 2 3; do
		jq -e --arg model "$grok_model" --arg lvl "$level" \
			'(.reviewLevels[$lvl] | map(select(has("pi")) | .pi) | map(select(. == $model)) | length) == 1' \
			"$real_catalog" >/dev/null
	done
}

@test "reviewTimeouts and reviewLevels match parallel-review catalog" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local -a expected_timeouts=(
		$'1\t300\t300'
		$'2\t600\t600'
		$'3\t600\t900'
	)
	local line level initial retry

	for line in "${expected_timeouts[@]}"; do
		IFS=$'\t' read -r level initial retry <<<"$line"
		jq -e --arg lvl "$level" --argjson initial "$initial" --argjson retry "$retry" \
			'.reviewTimeouts[$lvl].initial == $initial and .reviewTimeouts[$lvl].retry == $retry' \
			"$real_catalog" >/dev/null
	done

	jq -e '.reviewLevels | to_entries[] | .value[] | (has("pi") or has("role")) and (. | keys | length == 1)' \
		"$real_catalog" >/dev/null

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 3
	[ "$status" -eq 0 ]
	[ "${lines[0]}" = "$(printf 'pi\txai/grok-4.6\t600\t900')" ]
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

@test "review.antigravity appears exactly once in every parallel-review level" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"

	for level in 1 2 3; do
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

@test "each parallel-review level has unique reviewer keys (4/4/5)" {
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local -a expected_counts=(4 4 5)

	for level in 1 2 3; do
		local expected="${expected_counts[$((level - 1))]}"
		jq -e --arg lvl "$level" --argjson expected "$expected" '
			.reviewLevels[$lvl] as $entries |
			($entries | length == $expected) and
			([$entries[] |
				if has("pi") then ("pi:" + .pi)
				elif has("role") then ("role:" + .role)
				else empty end
			] | unique | length == $expected)
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

@test "GPT roles, review tiers, and modelOverrides align with codex.default catalog model" {
	# Arrange — integration against the tracked repo catalog
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_models="$BATS_TEST_DIRNAME/../models.json"
	local codex_id codex_pi_base codex_entry

	codex_id=$(jq -r '.roles["codex.default"].id' "$real_catalog")
	codex_pi_base="openai-codex/$codex_id"

	# Assert — enabledModels cycling GPT entries share the codex.default base model
	jq -e --arg base "$codex_pi_base" \
		'[.enabledModels[] | select(startswith("openai-codex/"))] | length > 0 and all(startswith($base + ":"))' \
		"$real_catalog" >/dev/null

	# Assert — single reviewer review.codex uses high effort on the same base model
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.codex
	[ "$status" -eq 0 ]
	[ "$output" = "${codex_pi_base}:high" ]

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --label review.codex
	[ "$status" -eq 0 ]
	[[ "$output" == *"High"* ]]

	# Assert — parallel-review GPT tiers use high / xhigh / max efforts
	local level effort
	for level in 1 2 3; do
		case "$level" in
		1) effort=high ;;
		2) effort=xhigh ;;
		3) effort=max ;;
		esac
		codex_entry=$(jq -r --arg lvl "$level" \
			'[.reviewLevels[$lvl][] | select(has("pi")) | select(.pi | startswith("openai-codex/")) | .pi][0]' \
			"$real_catalog")
		[ "$codex_entry" = "${codex_pi_base}:${effort}" ]
	done

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
