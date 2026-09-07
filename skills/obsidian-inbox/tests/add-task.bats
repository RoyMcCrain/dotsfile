#!/usr/bin/env bats
# shellcheck disable=SC2030,SC2031

setup() {
	TEST_ROOT="$BATS_TEST_TMPDIR/obsidian-inbox"
	mkdir -p "$TEST_ROOT"
	SCRIPT="$BATS_TEST_DIRNAME/../scripts/add-task.sh"
	INBOX="$TEST_ROOT/Inbox.md"
}

make_inbox_fixture() {
	cat >"$INBOX" <<'EOF'
# 📥 Inbox

## 🚨 最優先
- [ ]

## 📅 期限あり
- [ ]

## ⏳ 期限なし・あとで
- [ ]
EOF
}

make_inbox_without_placeholders() {
	cat >"$INBOX" <<'EOF'
# 📥 Inbox

## 🚨 最優先

## 📅 期限あり
- [ ] existing due task 📅 2099-01-01

## ⏳ 期限なし・あとで
- [ ]
EOF
}

make_inbox_missing_section() {
	cat >"$INBOX" <<'EOF'
# 📥 Inbox

## 🚨 最優先
- [ ]

## ⏳ 期限なし・あとで
- [ ]
EOF
}

snapshot_inbox() {
	cp "$INBOX" "$TEST_ROOT/inbox.snapshot"
}

inbox_unchanged() {
	diff -u "$TEST_ROOT/inbox.snapshot" "$INBOX"
}

file_mode() {
	stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

@test "due task is inserted before placeholder in due section with trailing metadata" {
	# Arrange
	make_inbox_fixture
	local due="2099-06-15"

	# Act
	run bash "$SCRIPT" --file "$INBOX" --due "$due" -- "Buy milk"

	# Assert
	[ "$status" -eq 0 ]
	[[ "$output" == "- [ ] Buy milk 📅 $due" ]]
	local section
	section=$(awk '
		/^## 📅 期限あり$/ { show=1; next }
		show && /^## / { exit }
		show { print }
	' "$INBOX")
	[[ "$section" == *"- [ ] Buy milk 📅 $due"* ]]
	local first second
	first=$(printf '%s\n' "$section" | sed -n '1p')
	second=$(printf '%s\n' "$section" | sed -n '2p')
	[[ "$first" == "- [ ] Buy milk 📅 $due" ]]
	[[ "$second" == "- [ ]" || "$second" == "- [ ] " ]]
}

@test "task without due date goes to the no-deadline section" {
	# Arrange
	make_inbox_fixture

	# Act
	run bash "$SCRIPT" --file "$INBOX" -- "Read release notes"

	# Assert
	[ "$status" -eq 0 ]
	[[ "$output" == "- [ ] Read release notes" ]]
	local section
	section=$(awk '
		/^## ⏳ 期限なし・あとで$/ { show=1; next }
		show && /^## / { exit }
		show { print }
	' "$INBOX")
	[[ "$section" == *"- [ ] Read release notes"* ]]
	local first second
	first=$(printf '%s\n' "$section" | sed -n '1p')
	second=$(printf '%s\n' "$section" | sed -n '2p')
	[[ "$first" == "- [ ] Read release notes" ]]
	[[ "$second" == "- [ ]" || "$second" == "- [ ] " ]]
}

@test "priority task with due date goes to priority section with due and priority metadata" {
	# Arrange
	make_inbox_fixture
	local due="2099-12-31"

	# Act
	run bash "$SCRIPT" --file "$INBOX" --due "$due" --priority -- "Fix production bug"

	# Assert
	[ "$status" -eq 0 ]
	[[ "$output" == "- [ ] Fix production bug 📅 $due ⏫" ]]
	local section
	section=$(awk '
		/^## 🚨 最優先$/ { show=1; next }
		show && /^## / { exit }
		show { print }
	' "$INBOX")
	[[ "$section" == *"- [ ] Fix production bug 📅 $due ⏫"* ]]
}

@test "preserves literal backslash sequences in task text" {
	# Arrange
	make_inbox_fixture
	local text='Keep literal \n and \t markers'

	# Act
	run bash "$SCRIPT" --file "$INBOX" -- "$text"

	# Assert
	[ "$status" -eq 0 ]
	[ "$output" = "- [ ] $text" ]
	[ "$(rg -Fxc -- "- [ ] $text" "$INBOX")" -eq 1 ]
}

@test "preserves inbox file mode" {
	# Arrange
	make_inbox_fixture
	chmod 640 "$INBOX"

	# Act
	run env TMPDIR="$TEST_ROOT/missing-tmp" bash "$SCRIPT" --file "$INBOX" -- "Keep file mode"

	# Assert
	[ "$status" -eq 0 ]
	[ "$(file_mode "$INBOX")" = "640" ]
}

@test "inserts before next heading when placeholder is absent" {
	# Arrange
	make_inbox_without_placeholders
	local due="2099-03-01"

	# Act
	run bash "$SCRIPT" --file "$INBOX" --due "$due" -- "New due task"

	# Assert
	[ "$status" -eq 0 ]
	[[ "$output" == "- [ ] New due task 📅 $due" ]]
	local section
	section=$(awk '
		/^## 📅 期限あり$/ { show=1; next }
		show && /^## / { exit }
		show { print }
	' "$INBOX")
	[[ "$section" == *"- [ ] New due task 📅 $due"* ]]
	[[ "$section" == *"- [ ] existing due task 📅 2099-01-01"* ]]
}

@test "invalid due date fails without modifying inbox" {
	# Arrange
	make_inbox_fixture
	snapshot_inbox

	# Act
	run bash "$SCRIPT" --file "$INBOX" --due "not-a-date" -- "Broken task"

	# Assert
	[ "$status" -ne 0 ]
	[[ "$output" == *"YYYY-MM-DD"* ]]
	inbox_unchanged
}

@test "empty task text fails without modifying inbox" {
	# Arrange
	make_inbox_fixture
	snapshot_inbox

	# Act
	run bash "$SCRIPT" --file "$INBOX" -- ""

	# Assert
	[ "$status" -ne 0 ]
	[[ "$output" == *"empty"* || "$output" == *"text"* ]]
	inbox_unchanged
}

@test "missing target section fails without modifying inbox" {
	# Arrange
	make_inbox_missing_section
	snapshot_inbox

	# Act
	run bash "$SCRIPT" --file "$INBOX" --due "2099-01-01" -- "Needs due section"

	# Assert
	[ "$status" -ne 0 ]
	[[ "$output" == *"section"* || "$output" == *"heading"* ]]
	inbox_unchanged
}

@test "OBSIDIAN_INBOX_FILE override is honored" {
	# Arrange
	local override="$TEST_ROOT/custom-inbox.md"
	make_inbox_fixture
	cp "$INBOX" "$override"
	snapshot_inbox

	# Act
	run env OBSIDIAN_INBOX_FILE="$override" bash "$SCRIPT" -- "Override path task"

	# Assert
	[ "$status" -eq 0 ]
	[[ "$output" == "- [ ] Override path task" ]]
	rg -Fq -- "- [ ] Override path task" "$override"
	inbox_unchanged
}
