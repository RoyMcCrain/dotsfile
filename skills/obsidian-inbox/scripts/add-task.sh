#!/usr/bin/env bash
# Append one Obsidian Tasks line to the Vault Inbox file.
set -euo pipefail

die() {
	printf '%s\n' "$1" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Usage: add-task.sh [--file PATH] [--due YYYY-MM-DD] [--priority] -- TEXT...

Append one Obsidian Tasks line to the Inbox file.
Default file: OBSIDIAN_INBOX_FILE or $HOME/Documents/Vault/📥 Inbox.md
EOF
}

validate_due_date() {
	local due=$1

	if [[ ! "$due" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
		die "invalid due date format (expected YYYY-MM-DD): $due"
	fi

	if date -j -f "%Y-%m-%d" "$due" "+%Y-%m-%d" >/dev/null 2>&1; then
		[[ "$(date -j -f "%Y-%m-%d" "$due" "+%Y-%m-%d")" == "$due" ]] || die "invalid due date: $due"
	elif date -d "$due" "+%Y-%m-%d" >/dev/null 2>&1; then
		[[ "$(date -d "$due" "+%Y-%m-%d")" == "$due" ]] || die "invalid due date: $due"
	else
		die "invalid due date: $due"
	fi
}

validate_task_text() {
	local text=$1

	if [[ -z "$text" ]]; then
		die "task text must not be empty"
	fi

	if [[ "$text" == *$'\n'* || "$text" == *$'\r'* ]]; then
		die "task text must not contain newlines"
	fi
}

build_task_line() {
	local text=$1
	local due=${2:-}
	local priority=${3:-0}

	local line="- [ ] $text"

	if [[ -n "$due" ]]; then
		line+=" 📅 $due"
	fi

	if [[ "$priority" -eq 1 ]]; then
		line+=" ⏫"
	fi

	printf '%s' "$line"
}

select_section_heading() {
	local priority=$1
	local due=$2

	if [[ "$priority" -eq 1 ]]; then
		printf '%s' '## 🚨 最優先'
	elif [[ -n "$due" ]]; then
		printf '%s' '## 📅 期限あり'
	else
		printf '%s' '## ⏳ 期限なし・あとで'
	fi
}

insert_task_line() {
	local inbox_file=$1
	local section_heading=$2
	local task_line=$3

	local inbox_dir mode tmp
	inbox_dir=$(dirname "$inbox_file")
	tmp=$(mktemp "$inbox_dir/.obsidian-inbox.XXXXXX")
	trap 'rm -f "$tmp"' RETURN EXIT

	TASK_LINE=$task_line awk -v section="$section_heading" '
		function flush_section() {
			if (in_section && !inserted) {
				print task
				inserted = 1
			}
		}

		BEGIN {
			task = ENVIRON["TASK_LINE"]
			in_section = 0
			inserted = 0
			found_section = 0
		}

		$0 == section {
			found_section = 1
			in_section = 1
			print
			next
		}

		in_section && /^## / {
			flush_section()
			in_section = 0
			print
			next
		}

		in_section && /^- \[ \][[:space:]]*$/ {
			if (!inserted) {
				print task
				inserted = 1
			}
			print
			next
		}

		{
			print
		}

		END {
			if (!found_section) {
				exit 2
			}
			flush_section()
			if (!inserted) {
				exit 3
			}
		}
	' "$inbox_file" >"$tmp" || {
		local awk_status=$?
		rm -f "$tmp"
		trap - RETURN EXIT
		case "$awk_status" in
		2) die "target section heading not found: $section_heading" ;;
		3) die "failed to insert task into section: $section_heading" ;;
		*) die "failed to update inbox file: $inbox_file" ;;
		esac
	}

	mode=$(stat -f '%Lp' "$inbox_file" 2>/dev/null || stat -c '%a' "$inbox_file")
	chmod "$mode" "$tmp" || die "failed to preserve inbox file mode: $inbox_file"
	mv "$tmp" "$inbox_file"
	trap - RETURN EXIT

	printf '%s\n' "$task_line"
}

main() {
	local inbox_file=${OBSIDIAN_INBOX_FILE:-"$HOME/Documents/Vault/📥 Inbox.md"}
	local due=""
	local priority=0
	local text=""
	local saw_separator=0

	while (($# > 0)); do
		case "$1" in
		-h | --help)
			usage
			exit 0
			;;
		--file)
			shift
			(($# > 0)) || die "missing value for --file"
			inbox_file=$1
			;;
		--due)
			shift
			(($# > 0)) || die "missing value for --due"
			due=$1
			;;
		--priority)
			priority=1
			;;
		--)
			saw_separator=1
			shift
			break
			;;
		-*)
			die "unknown option: $1"
			;;
		*)
			if [[ "$saw_separator" -eq 1 ]]; then
				break
			fi
			die "unexpected argument: $1 (use -- before task text)"
			;;
		esac
		shift
	done

	if [[ "$saw_separator" -eq 0 ]]; then
		die "missing -- separator before task text"
	fi

	if (($# == 0)); then
		die "task text must not be empty"
	fi

	text=$*
	validate_task_text "$text"

	if [[ -n "$due" ]]; then
		validate_due_date "$due"
	fi

	[[ -f "$inbox_file" ]] || die "inbox file not found: $inbox_file"
	[[ -r "$inbox_file" && -w "$inbox_file" ]] || die "inbox file is not readable/writable: $inbox_file"

	local section_heading task_line
	section_heading=$(select_section_heading "$priority" "$due")
	task_line=$(build_task_line "$text" "$due" "$priority")
	insert_task_line "$inbox_file" "$section_heading" "$task_line"
}

main "$@"
