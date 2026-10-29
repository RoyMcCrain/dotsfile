#!/usr/bin/env bash
# Preview or install macOS launchd job for weekly jev-audit run (Monday 09:00 local).
set -euo pipefail

INSTALL=0
AUTO_APPROVE_ARG=
while [[ $# -gt 0 ]]; do
	case "$1" in
	--install) INSTALL=1 ;;
	--auto-approve) AUTO_APPROVE_ARG=--auto-approve ;;
	--help)
		cat <<'EOF'
Usage: install_weekly_launchd.sh [--install] [--auto-approve]

Default: print launchd plist preview to stdout only (no filesystem writes).
--install: write ~/Library/LaunchAgents/... and load (explicit opt-in only; Darwin).
--auto-approve: enable explicit standing Codex approval after conservative local preflight.
Runs: Bun without a Deno-style runtime sandbox on skills/jev-audit/scripts/audit.ts run
Bun has no equivalent permission scopes; application validation remains in effect.
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

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)
BUN=$(command -v bun || true)
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
[[ -n ${BUN} ]] && PATH_PARTS+=("$(dirname "$BUN")")
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

MODEL_RESOLVER_RAW="${MODEL_RESOLVER:-}"
MODEL_RESOLVER_E=""
if [[ -n ${MODEL_RESOLVER_RAW} ]]; then
	require_readable_regular MODEL_RESOLVER "${MODEL_RESOLVER_RAW}"
	MODEL_RESOLVER_E=$(xml_escape "${MODEL_RESOLVER_RAW}")
fi

BUN_E=$(xml_escape "$BUN")
AUDIT_E=$(xml_escape "$AUDIT_TS")
LOG_E=$(xml_escape "$LOG")
HOME_E=$(xml_escape "$HOME")
PATH_E=$(xml_escape "$LAUNCH_PATH")
PI_DIR_E=$(xml_escape "$PI_DIR")
XDG_E=$(xml_escape "$XDG_DATA")
TMP_E=$(xml_escape "$JEV_TMP")
JEV_BASH_E=$(xml_escape "$JEV_AUDIT_BASH")
PI_REVIEW_E=$(xml_escape "$PI_REVIEW")
AUTO_APPROVE_XML=
if [[ -n ${AUTO_APPROVE_ARG} ]]; then
	AUTO_APPROVE_XML=$'\n    <string>--auto-approve</string>'
fi

render_plist() {
	cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BUN_E}</string>
    <string>--config=/dev/null</string>
    <string>--no-env-file</string>
    <string>--no-install</string>
    <string>run</string>
    <string>${AUDIT_E}</string>
    <string>run</string>${AUTO_APPROVE_XML}
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
require_executable_regular bun "${BUN}"
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
