#!/usr/bin/env bash
# Resolve / apply model roles from model-roles.json.
# Usage:
#   resolve-model.sh ROLE                 print Pi model id (default consumer)
#   resolve-model.sh --field cursor ROLE  print Cursor Agent model id
#   resolve-model.sh --label ROLE         print display label
#   resolve-model.sh --json ROLE          print role object
#   resolve-model.sh --field FIELD ROLE   print one role field
#   resolve-model.sh --list               list roles
#   resolve-model.sh --review-level N [--current-model MODEL [--current-backend pi|agy]]
#                                          print "backend<TAB>model<TAB>initial<TAB>retry" per reviewer
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
Usage: resolve-model.sh [--label|--json|--field FIELD|--list|--review-level N [--current-model MODEL [--current-backend pi|agy]]|--apply|--check] [ROLE]
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
	role_query "$1" "$2" '.roles[$role] | .label // .pi // .cursor // .id // .agy // empty' 'label'
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

# reviewLevels drive parallel-review tiers (1=lightest … 5=deepest).
# Emit per reviewer: backend (pi or agy), model id, initial timeout, retry timeout.
# Levels with {"current":true} need PI_PROVIDER/PI_MODEL (optional PI_REASONING_LEVEL) or --current-model.

print_review_level() {
	local catalog="$1"
	local level="$2"
	local explicit_current_model="${3:-}"
	local explicit_current_backend="${4:-pi}"

	jq -er \
		--arg lvl "$level" \
		--arg em "$explicit_current_model" \
		--arg eb "$explicit_current_backend" \
		--arg pp "${PI_PROVIDER:-}" \
		--arg pm "${PI_MODEL:-}" \
		--arg pr "${PI_REASONING_LEVEL:-}" \
		'
		def pos_int($x):
			($x | type) == "number" and ($x > 0) and ($x == ($x | floor));
		def valid_token($s):
			($s | type) == "string" and ($s | length) > 0
			and (($s | test("[[:space:]]|[[:cntrl:]]")) | not);
		def strip_effort($m):
			$m | sub(":(off|minimal|low|medium|high|xhigh|max)$"; "");
		def pi_rest($m):
			($m | index("/")) as $i |
			if $i == null then error("incomplete pi model (expected provider/model): \($m)")
			else $m[$i + 1:] end;
		def model_key($backend; $model):
			if $backend == "pi" then strip_effort(pi_rest($model))
			elif $backend == "agy" then strip_effort($model)
			else error("unsupported review backend") end;
		def checked_row($backend; $model):
			if ($backend | IN("pi", "agy") | not) then error("unsupported review backend: \($backend)")
			elif valid_token($model) | not then error("invalid model id (control characters or whitespace): \($model)")
			elif $backend == "pi" then
				($model | index("/")) as $i |
				if $i == null then error("incomplete pi model (expected provider/model): \($model)")
				else
					($model[0:$i] as $prov | strip_effort(pi_rest($model)) as $bare |
					if ($prov | length) == 0 or ($bare | length) == 0 then
						error("incomplete pi model (expected provider/model): \($model)")
					else . end)
				end
			else . end;
		def validate_entry($e):
			if ($e | type) != "object" then error("invalid reviewLevels entry")
			elif ($e | has("pi")) and ($e | has("role")) then error("reviewLevels entry must not have both pi and role")
			elif ($e | keys | length) != 1 then error("reviewLevels entry must have exactly one key")
			elif $e | has("current") then
				if $e.current != true then error("invalid reviewLevels entry: current must be true") else $e end
			elif $e | has("pi") then
				if ($e.pi | type) != "string" or ($e.pi | length) == 0 then error("invalid pi model in reviewLevels")
				else $e end
			elif $e | has("role") then
				if ($e.role | type) != "string" or ($e.role | length) == 0 then error("invalid role reference in reviewLevels")
				else $e end
			else error("reviewLevels entry must have pi, role, or current") end;
		def known_effort($e): $e | IN("off", "minimal", "low", "medium", "high", "xhigh", "max");
		# Colon suffixes on model ids are literal catalog/runtime ids; PI_REASONING_LEVEL is validated separately.
		def resolve_current($needs):
			if ($em | length) > 0 then
				if ($eb | IN("pi", "agy") | not) then error("unsupported --current-backend: \($eb) (use pi or agy)")
				else
					checked_row($eb; $em) |
					if $needs then {backend: $eb, model: $em, current: true} else null end
				end
			elif $needs | not then null
			elif $eb != "pi" then error("--current-backend \($eb) requires --current-model")
			elif ($pp | length) == 0 or ($pm | length) == 0 then
				error("review level requires current model: export PI_PROVIDER and PI_MODEL or pass --current-model")
			else
				if valid_token($pp) | not then error("invalid PI_PROVIDER for current model (control characters or whitespace)") else . end |
				if ($pp | index("/")) != null then error("invalid PI_PROVIDER for current model (must not contain slash): \($pp)") else . end |
				if valid_token($pm) | not then error("invalid PI_MODEL for current model (control characters or whitespace)") else . end |
				if ($pr | length) > 0 then
					if valid_token($pr) | not then error("invalid PI_REASONING_LEVEL for current model (control characters or whitespace)") else . end |
					if known_effort($pr) | not then error("invalid PI_REASONING_LEVEL: \($pr)") else . end
				else . end |
				("\($pp)/\($pm)" + (if ($pr | length) > 0 then ":\($pr)" else "" end)) as $assembled |
				checked_row("pi"; $assembled) | {backend: "pi", model: $assembled, current: true}
			end;
		def entry_row($roles; $cur; $e):
			validate_entry($e) |
			if has("current") then $cur
			elif has("pi") then {backend: "pi", model: .pi, current: false}
			else
				(.role as $r | $roles[$r].agy) as $agy |
				if $agy == null or ($agy | type) != "string" or ($agy | length) == 0 then
					error("role \(.role) has no agy model")
				else {backend: "agy", model: $agy, current: false} end
			end;

		if (.reviewLevels | has($lvl) | not) then error("unknown review level: \($lvl)") else . end |
		(.reviewTimeouts[$lvl]) as $t |
		if ($t | type) != "object" or (pos_int($t.initial) | not) or (pos_int($t.retry) | not) then
			error("invalid reviewTimeouts budgets")
		else . end |
		(.reviewLevels[$lvl]) as $raw |
		if ($raw | type) != "array" then error("invalid reviewLevels for level \($lvl)")
		elif ($raw | length) == 0 then error("empty reviewLevels for level \($lvl)")
		else . end |
		if ($raw | map(select(has("current"))) | length) > 1 then
			error("reviewLevels tier must have at most one current marker")
		else . end |
		.roles as $roles |
		($raw | any(has("current"))) as $needs |
		(resolve_current($needs)) as $cur |
		if $needs and $cur == null then error("internal error: current model not resolved") else . end |
		[ $raw[] | entry_row($roles; $cur; .) ] as $rows |
		($rows | map(checked_row(.backend; .model) | .)) as $validated |
		($validated | map(select(.current | not) | model_key(.backend; .model))) as $fixed_keys |
		$validated
		| map(if .current and (model_key(.backend; .model) as $k | $fixed_keys | index($k) != null) then empty else . end)
		| map([.backend, .model, ($t.initial | tostring), ($t.retry | tostring)] | join("\t"))
		| .[]
		' "$catalog"
}

list_roles() {
	jq -r '
		.roles
		| to_entries
		| .[]
		| [
			.key,
			(.value.pi // .value.cursor // .value.id // .value.agy // ""),
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

# Live Codex config is app-owned at ${CODEX_HOME:-$HOME/.codex}/config.toml.
codex_config_path() {
	if [[ -n "${CODEX_CONFIG_FILE:-}" ]]; then
		printf '%s\n' "$CODEX_CONFIG_FILE"
		return
	fi
	printf '%s\n' "${CODEX_HOME:-$HOME/.codex}/config.toml"
}

codex_config_model() {
	awk -F'"' '/^model = /{print $2; exit}' "$1"
}

apply_codex() {
	local catalog="$1"
	local config wanted
	config=$(codex_config_path)
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
	config=$(codex_config_path)
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
	local catalog mode field role level current_model current_backend current_model_flag
	catalog=$(resolve_catalog)
	require_catalog "$catalog"

	mode="pi"
	field=''
	role=''
	level=''
	current_model=''
	current_backend='pi'
	current_model_flag=0

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
		--current-model)
			shift
			[[ $# -gt 0 ]] || usage
			current_model=$1
			current_model_flag=1
			;;
		--current-backend)
			shift
			[[ $# -gt 0 ]] || usage
			current_backend=$1
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
		if ((current_model_flag)) && [[ -z "$current_model" ]]; then
			die "missing model for --current-model"
		fi
		case "$current_backend" in
		pi | agy) ;;
		*) die "unsupported --current-backend: $current_backend (use pi or agy)" ;;
		esac
		print_review_level "$catalog" "$level" "$current_model" "$current_backend"
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
