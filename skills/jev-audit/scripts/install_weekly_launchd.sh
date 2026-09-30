#!/usr/bin/env bash
# Preview or install macOS launchd job for weekly jev-audit run (Monday 09:00 local).
set -euo pipefail

INSTALL=0
while [[ $# -gt 0 ]]; do
	case "$1" in
	--install) INSTALL=1 ;;
	--help)
		cat <<'EOF'
Usage: install_weekly_launchd.sh [--install]

Default: print launchd plist preview to stdout only (no filesystem writes).
--install: write ~/Library/LaunchAgents/... and load (explicit opt-in only; Darwin).
Runs: deno with scoped permissions on skills/jev-audit/scripts/audit.ts run
Schedule: Monday 09:00 in the local timezone.
Default audit week is the previous completed UTC week; local Monday 09:00 may differ from UTC week boundaries.
EOF
		exit 0
		;;
	*)
		echo "unknown arg: $1" >&2
		exit 1
		;;
	esac
	shift
done

# Bash 5 patsub treats '&' in the replacement as the matched substring; prefix with '\&'.
xml_escape() {
	local s=$1
	s=${s//&/\&amp;}
	s=${s//</\&lt;}
	s=${s//>/\&gt;}
	s=${s//\"/\&quot;}
	s=${s//\'/\&#39;}
	printf '%s' "$s"
}

deny_comma_paths() {
	local label=$1
	shift
	local p
	for p in "$@"; do
		if [[ "$p" == *','* ]]; then
			printf '%s\n' "path for ${label} contains comma (unsupported in Deno scoped permissions): ${p}" >&2
			exit 1
		fi
	done
}

require_absolute() {
	local name=$1
	local value=$2
	if [[ -z ${value} || ${value:0:1} != '/' ]]; then
		printf '%s\n' "${name} must resolve to an absolute path (got: ${value:-<empty>})" >&2
		exit 1
	fi
}

require_executable_regular() {
	local name=$1
	local path=$2
	require_absolute "${name}" "${path}"
	if [[ ! -f ${path} || ! -x ${path} ]]; then
		printf '%s\n' "${name} must be an executable regular file (got: ${path})" >&2
		exit 1
	fi
}

require_readable_regular() {
	local name=$1
	local path=$2
	require_absolute "${name}" "${path}"
	if [[ ! -f ${path} || ! -r ${path} ]]; then
		printf '%s\n' "${name} must be a readable regular file (got: ${path})" >&2
		exit 1
	fi
}

reject_symlink_ancestors_under() {
	local root=$1
	local leaf=$2
	local label=$3
	local rel partial part
	if [[ ${leaf} != "${root}" && ${leaf} != "${root}/"* ]]; then
		printf '%s\n' "${label} is not under ${root}" >&2
		exit 1
	fi
	if [[ ${leaf} == "${root}" ]]; then
		return 0
	fi
	rel=${leaf#"${root}/"}
	partial="${root}"
	while [[ -n ${rel} ]]; do
		part=${rel%%/*}
		partial="${partial}/${part}"
		if [[ -L ${partial} ]]; then
			printf '%s\n' "refusing ${label} symlink ancestor: ${partial}" >&2
			exit 1
		fi
		if [[ ${rel} == */* ]]; then
			rel=${rel#*/}
		else
			rel=
		fi
	done
}

resolve_physical() {
	local path=$1
	local probe=${path}
	while [[ ! -e ${probe} && ${probe} != '/' ]]; do
		probe=$(dirname "$probe")
	done
	if [[ ! -e ${probe} ]]; then
		printf '%s' "${path}"
		return 0
	fi
	local base
	base=$(cd "${probe}" && pwd -P) || {
		printf '%s' "${path}"
		return 0
	}
	if [[ ${probe} == "${path}" ]]; then
		printf '%s' "${base}"
	else
		printf '%s/%s' "${base}" "${path#"${probe}/"}"
	fi
}

PERM_READ_PARTS=()
PERM_WRITE_PARTS=()
perm_bucket_contains() {
	local bucket=$1
	local want=$2
	local existing
	case "${bucket}" in
	PERM_READ_PARTS)
		if ((${#PERM_READ_PARTS[@]} > 0)); then
			for existing in "${PERM_READ_PARTS[@]}"; do
				[[ "${existing}" == "${want}" ]] && return 0
			done
		fi
		;;
	PERM_WRITE_PARTS)
		if ((${#PERM_WRITE_PARTS[@]} > 0)); then
			for existing in "${PERM_WRITE_PARTS[@]}"; do
				[[ "${existing}" == "${want}" ]] && return 0
			done
		fi
		;;
	esac
	return 1
}
perm_bucket_add() {
	local bucket=$1
	local path=$2
	[[ -z ${path} ]] && return 0
	local alias
	perm_bucket_contains "${bucket}" "${path}" && return 0
	case "${bucket}" in
	PERM_READ_PARTS) PERM_READ_PARTS+=("${path}") ;;
	PERM_WRITE_PARTS) PERM_WRITE_PARTS+=("${path}") ;;
	esac
	if [[ ${path} == /private/* ]]; then
		alias=${path#/private}
		perm_bucket_contains "${bucket}" "${alias}" && return 0
		case "${bucket}" in
		PERM_READ_PARTS) PERM_READ_PARTS+=("${alias}") ;;
		PERM_WRITE_PARTS) PERM_WRITE_PARTS+=("${alias}") ;;
		esac
	fi
}
join_perm_paths() {
	local bucket=$1
	local out=''
	local item
	case "${bucket}" in
	PERM_READ_PARTS)
		if ((${#PERM_READ_PARTS[@]} == 0)); then
			return 0
		fi
		for item in "${PERM_READ_PARTS[@]}"; do
			if [[ -n ${out} ]]; then
				out+=",${item}"
			else
				out=${item}
			fi
		done
		;;
	PERM_WRITE_PARTS)
		if ((${#PERM_WRITE_PARTS[@]} == 0)); then
			return 0
		fi
		for item in "${PERM_WRITE_PARTS[@]}"; do
			if [[ -n ${out} ]]; then
				out+=",${item}"
			else
				out=${item}
			fi
		done
		;;
	esac
	printf '%s' "${out}"
}

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)
DENO=$(command -v deno || true)
PI_BIN=$(command -v pi || true)
JQ_BIN=$(command -v jq || true)

resolve_bash5() {
	if [[ -n ${JEV_AUDIT_BASH:-} ]]; then
		printf '%s' "${JEV_AUDIT_BASH}"
		return 0
	fi
	local dir candidate major
	IFS=':' read -r -a path_dirs <<<"${PATH}"
	for dir in "${path_dirs[@]}"; do
		[[ -z ${dir} ]] && continue
		candidate="${dir}/bash"
		[[ -x ${candidate} ]] || continue
		# shellcheck disable=SC2016
		major=$("${candidate}" -c 'echo ${BASH_VERSINFO[0]}' 2>/dev/null || echo 0)
		if ((major >= 5)); then
			printf '%s' "${candidate}"
			return 0
		fi
	done
	return 1
}

BASH5=$(resolve_bash5 || true)

PATH_PARTS=()
[[ -n ${BASH5} ]] && PATH_PARTS+=("$(dirname "$BASH5")")
[[ -n ${PI_BIN} ]] && PATH_PARTS+=("$(dirname "$PI_BIN")")
[[ -n ${JQ_BIN} ]] && PATH_PARTS+=("$(dirname "$JQ_BIN")")
[[ -n ${DENO} ]] && PATH_PARTS+=("$(dirname "$DENO")")
for extra in node perl ps sleep; do
	extra_bin=$(command -v "${extra}" 2>/dev/null || true)
	[[ -n ${extra_bin} ]] && PATH_PARTS+=("$(dirname "$extra_bin")")
done
PATH_PARTS+=("/opt/homebrew/bin" "/usr/local/bin" "/usr/bin" "/bin")
LAUNCH_PATH=$(
	IFS=:
	echo "${PATH_PARTS[*]}"
)

AUDIT_TS="${REPO_ROOT}/skills/jev-audit/scripts/audit.ts"
LABEL="com.roymc.jev-audit.weekly"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

XDG_DATA="${XDG_DATA_HOME:-${HOME}/.local/share}"
JEV_AUDIT="${XDG_DATA}/parallel-review/jev-audit"
JEV_TMP="${JEV_AUDIT}/tmp"
LOG="${JEV_AUDIT}/launchd.log"

PI_DIR="${PI_CODING_AGENT_DIR:-${HOME}/.pi/agent}"
PI_REVIEW="${PI_REVIEW_BIN:-${PI_BIN:-}}"
JEV_AUDIT_BASH="${BASH5}"

require_absolute HOME "${HOME}"
require_absolute XDG_DATA "${XDG_DATA}"
require_absolute PI_DIR "${PI_DIR}"
if [[ -n ${PI_REVIEW} ]]; then
	require_absolute PI_REVIEW "${PI_REVIEW}"
fi

HOME_P=$(resolve_physical "${HOME}")
XDG_P=$(resolve_physical "${XDG_DATA}")
JEV_AUDIT_P=$(resolve_physical "${JEV_AUDIT}")
JEV_TMP_P=$(resolve_physical "${JEV_TMP}")
PI_DIR_P=$(resolve_physical "${PI_DIR}")
CONFIG_P=$(resolve_physical "${HOME}/.config")

perm_bucket_add PERM_READ_PARTS "${REPO_ROOT}"
perm_bucket_add PERM_READ_PARTS "${HOME_P}"
perm_bucket_add PERM_READ_PARTS "${CONFIG_P}"
perm_bucket_add PERM_READ_PARTS "${PI_DIR_P}"
perm_bucket_add PERM_READ_PARTS "${XDG_P}"
perm_bucket_add PERM_READ_PARTS "${JEV_AUDIT_P}"
perm_bucket_add PERM_READ_PARTS "${JEV_TMP_P}"
perm_bucket_add PERM_WRITE_PARTS "${XDG_P}"
perm_bucket_add PERM_WRITE_PARTS "${JEV_AUDIT_P}"
perm_bucket_add PERM_WRITE_PARTS "${JEV_TMP_P}"

MODEL_RESOLVER_RAW="${MODEL_RESOLVER:-}"
MODEL_RESOLVER_E=""
if [[ -n ${MODEL_RESOLVER_RAW} ]]; then
	require_readable_regular MODEL_RESOLVER "${MODEL_RESOLVER_RAW}"
	MODEL_RESOLVER_E=$(xml_escape "${MODEL_RESOLVER_RAW}")
fi

ALLOW_READ=$(join_perm_paths PERM_READ_PARTS)
ALLOW_WRITE=$(join_perm_paths PERM_WRITE_PARTS)
ALLOW_ENV="HOME,XDG_DATA_HOME,PATH,PI_CODING_AGENT_DIR,PI_REVIEW_BIN,MODEL_RESOLVER,JEV_AUDIT_BASH,TMPDIR"

ALLOW_RUN_PARTS=()
append_allow_run() {
	local bin=$1
	[[ -z ${bin} || ! -x ${bin} ]] && return 0
	local existing
	if ((${#ALLOW_RUN_PARTS[@]} > 0)); then
		for existing in "${ALLOW_RUN_PARTS[@]}"; do
			[[ "${existing}" == "${bin}" ]] && return 0
		done
	fi
	ALLOW_RUN_PARTS+=("${bin}")
}
append_allow_run "${JEV_AUDIT_BASH}"
append_allow_run /bin/bash
[[ -n ${PI_REVIEW} ]] && append_allow_run "${PI_REVIEW}"
[[ -n ${DENO} ]] && append_allow_run "${DENO}"
ALLOW_RUN=$(
	IFS=,
	echo "${ALLOW_RUN_PARTS[*]}"
)

deny_comma_paths "scoped permission" "${REPO_ROOT}" "${HOME_P}" "${CONFIG_P}" "${PI_DIR_P}" "${XDG_P}" \
	"${JEV_AUDIT_P}" "${JEV_TMP_P}" "${JEV_AUDIT_BASH}" "${PI_REVIEW}" "${DENO}"

DENO_E=$(xml_escape "$DENO")
AUDIT_E=$(xml_escape "$AUDIT_TS")
LOG_E=$(xml_escape "$LOG")
HOME_E=$(xml_escape "$HOME")
PATH_E=$(xml_escape "$LAUNCH_PATH")
PI_DIR_E=$(xml_escape "$PI_DIR")
XDG_E=$(xml_escape "$XDG_DATA")
TMP_E=$(xml_escape "$JEV_TMP")
JEV_BASH_E=$(xml_escape "$JEV_AUDIT_BASH")
PI_REVIEW_E=$(xml_escape "$PI_REVIEW")
ALLOW_READ_E=$(xml_escape "$ALLOW_READ")
ALLOW_WRITE_E=$(xml_escape "$ALLOW_WRITE")
ALLOW_ENV_E=$(xml_escape "$ALLOW_ENV")
ALLOW_RUN_E=$(xml_escape "$ALLOW_RUN")

render_plist() {
	cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${DENO_E}</string>
    <string>run</string>
    <string>--allow-read=${ALLOW_READ_E}</string>
    <string>--allow-write=${ALLOW_WRITE_E}</string>
    <string>--allow-env=${ALLOW_ENV_E}</string>
    <string>--allow-run=${ALLOW_RUN_E}</string>
    <string>--no-config</string>
    <string>${AUDIT_E}</string>
    <string>run</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>1</integer>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>${LOG_E}</string>
  <key>StandardErrorPath</key><string>${LOG_E}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>${HOME_E}</string>
    <key>XDG_DATA_HOME</key><string>${XDG_E}</string>
    <key>PATH</key><string>${PATH_E}</string>
    <key>PI_CODING_AGENT_DIR</key><string>${PI_DIR_E}</string>
    <key>PI_REVIEW_BIN</key><string>${PI_REVIEW_E}</string>
    <key>JEV_AUDIT_BASH</key><string>${JEV_BASH_E}</string>
    <key>TMPDIR</key><string>${TMP_E}</string>${MODEL_RESOLVER_E:+
    <key>MODEL_RESOLVER</key><string>${MODEL_RESOLVER_E}</string>}
  </dict>
</dict>
</plist>
EOF
}

if ((INSTALL == 0)); then
	render_plist
	exit 0
fi

if [[ $(uname -s) != Darwin ]]; then
	echo "install requires Darwin" >&2
	exit 1
fi

if [[ -z ${JEV_AUDIT_BASH} ]]; then
	echo "bash not found" >&2
	exit 1
fi
require_executable_regular deno "${DENO}"
require_executable_regular jq "${JQ_BIN}"
require_executable_regular PI_REVIEW_BIN "${PI_REVIEW}"
require_executable_regular JEV_AUDIT_BASH "${JEV_AUDIT_BASH}"
# shellcheck disable=SC2016
bash_major=$("${JEV_AUDIT_BASH}" -c 'echo ${BASH_VERSINFO[0]}')
if ((bash_major < 5)); then
	echo "install requires Bash 5 or newer at JEV_AUDIT_BASH" >&2
	exit 1
fi

if [[ -L ${PLIST} ]]; then
	echo "refusing to overwrite symlink plist: ${PLIST}" >&2
	exit 1
fi
log_dir=$(dirname "$LOG")
reject_symlink_ancestors_under "${XDG_DATA}" "${log_dir}" "log directory"
reject_symlink_ancestors_under "${XDG_DATA}" "${LOG}" "log file"
reject_symlink_ancestors_under "${XDG_DATA}" "${JEV_TMP}" "tmp directory"
if [[ -e ${log_dir} && ! -d ${log_dir} ]]; then
	printf '%s\n' "log directory is not a directory: ${log_dir}" >&2
	exit 1
fi
if [[ -e ${LOG} && ! -f ${LOG} ]]; then
	printf '%s\n' "log file is not a regular file: ${LOG}" >&2
	exit 1
fi
if [[ -e ${JEV_TMP} && ! -d ${JEV_TMP} ]]; then
	printf '%s\n' "tmp path is not a directory: ${JEV_TMP}" >&2
	exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents" "${log_dir}" "${JEV_TMP}"
chmod 700 "${log_dir}" || {
	echo "failed to chmod 700 ${log_dir}" >&2
	exit 1
}
chmod 700 "${JEV_TMP}" || {
	echo "failed to chmod 700 ${JEV_TMP}" >&2
	exit 1
}
if [[ ! -e ${LOG} ]]; then
	: >"${LOG}"
fi
chmod 600 "${LOG}" || {
	echo "failed to chmod 600 ${LOG}" >&2
	exit 1
}

la_dir="${HOME}/Library/LaunchAgents"
tmp_plist=''
cleanup_tmp_plist() {
	if [[ -n ${tmp_plist} && -f ${tmp_plist} ]]; then
		rm -f "${tmp_plist}"
	fi
}
trap cleanup_tmp_plist EXIT INT TERM

tmp_plist=$(mktemp "${la_dir}/${LABEL}.plist.XXXXXX") || {
	echo "failed to create temporary plist under ${la_dir}" >&2
	exit 1
}
render_plist >"${tmp_plist}"
chmod 600 "${tmp_plist}"
plutil -lint "${tmp_plist}" >/dev/null
mv -f "${tmp_plist}" "${PLIST}"
tmp_plist=''
trap - EXIT INT TERM

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${PLIST}"

printf 'installed %s\n' "${PLIST}"
