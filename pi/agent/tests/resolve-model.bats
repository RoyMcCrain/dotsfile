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
