#!/usr/bin/env bash
# Resolve / apply model roles from model-roles.json.
# Usage:
#   resolve-model.sh ROLE                 print Pi model id (default consumer)
#   resolve-model.sh --field cursor ROLE  print Cursor Agent model id
#   resolve-model.sh --label ROLE         print display label
#   resolve-model.sh --json ROLE          print role object
#   resolve-model.sh --field FIELD ROLE   print one role field
#   resolve-model.sh --list               list roles
#   resolve-model.sh --review-level N      print "pi<TAB>initial<TAB>retry" per reviewer for a tier
#   resolve-model.sh --apply              sync enabledModels into settings.json
#   resolve-model.sh --check              verify enabledModels matches catalog
#
# defaultProvider / defaultModel are runtime state that Pi rewrites on /model,
# so they are deliberately left alone.
#
# shellcheck disable=SC2016  # $role / $field are jq variables, not shell ones
set -euo pipefail

die() {
	printf '%s\n' "$1" >&2
	exit "${2:-1}"
}

usage() {
	cat >&2 <<'EOF'
Usage: resolve-model.sh [--label|--json|--field FIELD|--list|--review-level N|--apply|--check] [ROLE]
EOF
	exit 1
}

script_dir() {
	local source="$1"
	while [[ -L "$source" ]]; do
		local target
		target=$(readlink "$source")
		if [[ "$target" == /* ]]; then
			source="$target"
		else
			source="$(cd "$(dirname "$source")" && pwd -P)/$target"
		fi
	done
	cd "$(dirname "$source")" && pwd -P
}

resolve_catalog() {
	if [[ -n "${MODEL_ROLES_FILE:-}" ]]; then
		printf '%s\n' "$MODEL_ROLES_FILE"
		return
	fi

	local dir catalog
	dir=$(script_dir "$0")
	catalog="$dir/model-roles.json"
	if [[ -f "$catalog" ]]; then
		printf '%s\n' "$catalog"
		return
	fi

	printf '%s\n' "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/model-roles.json"
}

require_catalog() {
	local catalog="$1"
	[[ -f "$catalog" ]] || die "model-roles catalog not found: $catalog"
}

require_jq() {
	command -v jq >/dev/null 2>&1 || die "jq is required"
}

require_sd() {
	command -v sd >/dev/null 2>&1 || die "sd is required"
}

require_role() {
	jq -e --arg role "$2" '.roles | has($role)' "$1" >/dev/null ||
		die "unknown model role: $2"
}

role_query() {
	local catalog="$1"
	local role="$2"
	local filter="$3"
	local what="$4"
	local value
	require_role "$catalog" "$role"
	value=$(jq -er --arg role "$role" "$filter" "$catalog") ||
		die "role $role has no $what"
	printf '%s\n' "$value"
}

# A role names one model per consumer: .pi for Pi, .cursor for Cursor Agent, .id for others.
print_pi() {
	role_query "$1" "$2" '.roles[$role] | .pi // .id // empty' 'model id'
}

print_label() {
	role_query "$1" "$2" '.roles[$role] | .label // .pi // .cursor // .id // empty' 'label'
}

print_json() {
	role_query "$1" "$2" '.roles[$role] // empty' 'definition'
}

print_field() {
	local catalog="$1"
	local field="$2"
	local role="$3"
	local value
	require_role "$catalog" "$role"
	value=$(jq -er --arg role "$role" --arg field "$field" \
		'.roles[$role][$field] // empty' "$catalog") ||
		die "role $role has no field: $field"
	printf '%s\n' "$value"
}

# reviewLevels drive parallel-review tiers (1=light, 2=standard, 3=deep).
# Emit per reviewer: pi id, initial timeout seconds, and retry timeout seconds.
print_review_level() {
	local catalog="$1"
	local level="$2"
	jq -e --arg lvl "$level" '.reviewLevels | has($lvl)' "$catalog" >/dev/null 2>&1 ||
		die "unknown review level: $level"
	jq -r --arg lvl "$level" '
		.reviewTimeouts[$lvl] as $t |
		.reviewLevels[$lvl][] |
		"\(.pi)\t\($t.initial)\t\($t.retry)"
	' "$catalog"
}

list_roles() {
	jq -r '
		.roles
		| to_entries
		| .[]
		| [
			.key,
			(.value.pi // .value.cursor // .value.id // ""),
			(.value.label // "")
		]
		| @tsv
	' "$1"
}

settings_path() {
	local catalog="$1"
	if [[ -n "${PI_SETTINGS_FILE:-}" ]]; then
		printf '%s\n' "$PI_SETTINGS_FILE"
		return
	fi
	printf '%s\n' "$(dirname "$catalog")/settings.json"
}

# codex/config.toml cannot expand variables, so keep its model line in sync here.
codex_config_path() {
	local catalog="$1"
	if [[ -n "${CODEX_CONFIG_FILE:-}" ]]; then
		printf '%s\n' "$CODEX_CONFIG_FILE"
		return
	fi
	printf '%s\n' "$(dirname "$catalog")/../../codex/config.toml"
}

codex_config_model() {
	awk -F'"' '/^model = /{print $2; exit}' "$1"
}

apply_codex() {
	local catalog="$1"
	local config wanted
	config=$(codex_config_path "$catalog")
	[[ -f "$config" ]] || return 0

	wanted=$(jq -er '.roles["codex.default"].id // empty' "$catalog") ||
		die "catalog has no codex.default role"

	if [[ "$(codex_config_model "$config")" == "$wanted" ]]; then
		return 0
	fi
	sd "(?m)^model = \".*\"$" "model = \"$wanted\"" "$config"
	printf 'updated model in %s to %s\n' "$config" "$wanted"
}

check_codex() {
	local catalog="$1"
	local config wanted actual
	config=$(codex_config_path "$catalog")
	[[ -f "$config" ]] || return 0

	wanted=$(jq -er '.roles["codex.default"].id // empty' "$catalog") ||
		die "catalog has no codex.default role"
	actual=$(codex_config_model "$config")

	if [[ "$actual" == "$wanted" ]]; then
		printf 'ok: codex model in %s matches %s\n' "$config" "$catalog"
		return 0
	fi
	die "codex model mismatch: $config has '$actual', catalog wants '$wanted'"
}

apply_settings() {
	local catalog="$1"
	local settings
	settings=$(settings_path "$catalog")
	[[ -f "$settings" ]] || die "settings.json not found: $settings"
	# settings.json is a symlink into the dotfiles repo; resolve to the real file
	# so the atomic rename below updates the repo copy instead of clobbering the
	# symlink with a standalone file (which would silently break the link).
	settings=$(readlink -f "$settings")

	local tmp
	tmp=$(mktemp "$settings.XXXXXX")
	jq --slurpfile cat "$catalog" '.enabledModels = $cat[0].enabledModels' \
		"$settings" >"$tmp"

	# Update the dependent codex config first; set -e aborts here on failure,
	# leaving settings.json untouched so the two files never drift apart.
	apply_codex "$catalog"

	# tmp lives beside settings, so this is an atomic same-filesystem rename.
	mv "$tmp" "$settings"
	printf 'updated enabledModels in %s from %s\n' "$settings" "$catalog"
}

check_settings() {
	local catalog="$1"
	local settings
	settings=$(settings_path "$catalog")
	[[ -f "$settings" ]] || die "settings.json not found: $settings"

	if ! jq -e --slurpfile cat "$catalog" \
		'.enabledModels == $cat[0].enabledModels' "$settings" >/dev/null; then
		die "enabledModels does not match model-roles.json: $settings"
	fi
	printf 'ok: enabledModels in %s matches %s\n' "$settings" "$catalog"
	check_codex "$catalog"
}

main() {
	require_jq
	local catalog mode field role level
	catalog=$(resolve_catalog)
	require_catalog "$catalog"

	mode="pi"
	field=''
	role=''
	level=''

	while (($# > 0)); do
		case "$1" in
		--label)
			mode="label"
			;;
		--json)
			mode="json"
			;;
		--field)
			shift
			[[ $# -gt 0 ]] || usage
			mode="field"
			field=$1
			;;
		--list)
			mode="list"
			;;
		--review-level)
			shift
			[[ $# -gt 0 ]] || usage
			mode="review-level"
			level=$1
			;;
		--apply)
			mode="apply"
			;;
		--check)
			mode="check"
			;;
		-h | --help)
			usage
			;;
		--)
			shift
			break
			;;
		-*)
			die "unknown argument: $1"
			;;
		*)
			role=$1
			shift
			break
			;;
		esac
		shift
	done

	if (($# > 0)) && [[ -z "$role" ]]; then
		role=$1
		shift
	fi
	(($# == 0)) || die "unexpected argument: $1"

	case "$mode" in
	list)
		list_roles "$catalog"
		;;
	review-level)
		[[ -n "$level" ]] || usage
		print_review_level "$catalog" "$level"
		;;
	apply)
		require_sd
		apply_settings "$catalog"
		;;
	check)
		check_settings "$catalog"
		;;
	pi)
		[[ -n "$role" ]] || usage
		print_pi "$catalog" "$role"
		;;
	label)
		[[ -n "$role" ]] || usage
		print_label "$catalog" "$role"
		;;
	json)
		[[ -n "$role" ]] || usage
		print_json "$catalog" "$role"
		;;
	field)
		[[ -n "$role" && -n "$field" ]] || usage
		print_field "$catalog" "$field" "$role"
		;;
	esac
}

main "$@"
