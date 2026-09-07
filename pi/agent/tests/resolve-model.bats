#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/resolve-model"
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
    "codex.default": { "id": "gpt-test-model", "label": "Codex Test" }
  },
  "reviewTimeouts": {
    "1": { "initial": 45, "retry": 90 },
    "2": { "initial": 180, "retry": 240 }
  },
  "reviewLevels": {
    "1": [
      { "pi": "cursor/fast" },
      { "pi": "anthropic/sonnet:high" }
    ],
    "2": [
      { "pi": "sakana-ai-console/fugu-ultra:high" }
    ]
  }
}
EOF
}

@test "--review-level prints pi, initial and retry seconds per reviewer" {
	# Arrange
	write_catalog_with_levels

	# Act
	run "$RESOLVER" --review-level 1

	# Assert
	[ "$status" -eq 0 ]
	[ "${lines[0]}" = "$(printf 'cursor/fast\t45\t90')" ]
	[ "${lines[1]}" = "$(printf 'anthropic/sonnet:high\t45\t90')" ]
	[ "${#lines[@]}" -eq 2 ]
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

@test "Fugu integration disabled after subscription cancellation" {
	# Arrange — integration against tracked repo catalog, settings, models, archive
	local real_catalog="$BATS_TEST_DIRNAME/../model-roles.json"
	local real_settings="$BATS_TEST_DIRNAME/../settings.json"
	local real_models="$BATS_TEST_DIRNAME/../models.json"
	local archive="$BATS_TEST_DIRNAME/../fugu.disabled.json.example"

	# Assert — no Fugu/sakana at any review tier
	for level in 1 2 3; do
		run jq -e --arg lvl "$level" \
			'[.reviewLevels[$lvl][] | select(.pi | startswith("sakana-ai-console/"))] | length == 0' \
			"$real_catalog"
		[ "$status" -eq 0 ]
	done

	# Assert — all tiers have exactly 3 reviewers
	for level in 1 2 3; do
		run jq -e --arg lvl "$level" \
			'.reviewLevels[$lvl] | length == 3' \
			"$real_catalog"
		[ "$status" -eq 0 ]
	done

	# Assert — review.fugu role removed from active catalog
	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" review.fugu
	[ "$status" -ne 0 ]

	# Assert — no enabled Fugu models in catalog or settings
	run jq -e '[.enabledModels[] | select(startswith("sakana-ai-console/"))] | length == 0' \
		"$real_catalog"
	[ "$status" -eq 0 ]

	run jq -e '[.enabledModels[] | select(startswith("sakana-ai-console/"))] | length == 0' \
		"$real_settings"
	[ "$status" -eq 0 ]

	# Assert — no active sakana provider in models.json
	run jq -e '(.providers // {}) | has("sakana-ai-console") | not' "$real_models"
	[ "$status" -eq 0 ]

	# Assert — auto-fugu-model extension force-excluded
	run jq -e '.extensions | index("-extensions/auto-fugu-model.ts") != null' \
		"$real_settings"
	[ "$status" -eq 0 ]

	# Assert — archive preserves Fugu fragments for reactivation
	[ -f "$archive" ]
	run jq -e . "$archive"
	[ "$status" -eq 0 ]
	run jq -e \
		'(.enabledModels | sort) == (["sakana-ai-console/fugu:high", "sakana-ai-console/fugu-ultra:high"] | sort)' \
		"$archive"
	[ "$status" -eq 0 ]
	run jq -e '.roles["review.fugu"].pi == "sakana-ai-console/fugu-ultra:high"' "$archive"
	[ "$status" -eq 0 ]
	run jq -e \
		'[.reviewLevels["3"][] | select(.pi | startswith("sakana-ai-console/"))] | length == 1' \
		"$archive"
	[ "$status" -eq 0 ]
	run jq -e '.providers["sakana-ai-console"].models | length == 2' "$archive"
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
			'(.reviewLevels[$lvl] | map(.pi) | map(select(. == $model)) | length) == 1' \
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

	jq -e '.reviewLevels | to_entries[] | .value[] | has("pi") and (. | keys | length == 1)' \
		"$real_catalog" >/dev/null

	run env MODEL_ROLES_FILE="$real_catalog" "$RESOLVER" --review-level 3
	[ "$status" -eq 0 ]
	[ "${lines[0]}" = "$(printf 'xai/grok-4.6\t600\t900')" ]
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
			'[.reviewLevels[$lvl][] | select(.pi | startswith("openai-codex/")) | .pi][0]' \
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
