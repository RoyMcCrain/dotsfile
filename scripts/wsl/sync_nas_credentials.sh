#!/usr/bin/env bash
# Sync NAS SMB credentials from Bitwarden into /etc/samba/creds-nas
# for use with the credentials= mount option in /etc/fstab.
set -euo pipefail

ITEM_NAME="NAS SMB"
CREDS_PATH="/etc/samba/creds-nas"

if ! command -v bw >/dev/null 2>&1; then
	echo "bw (Bitwarden CLI) is required" >&2
	exit 1
fi

status="$(bw status | jq -r .status)"
if [[ "$status" != "unlocked" ]]; then
	echo "Bitwarden vault is locked. Run: export BW_SESSION=\$(bw unlock --raw)" >&2
	exit 1
fi

username="$(bw get username "$ITEM_NAME")"
password="$(bw get password "$ITEM_NAME")"

sudo install -d -m 755 "$(dirname "$CREDS_PATH")"
sudo install -m 600 /dev/null "$CREDS_PATH"
printf 'username=%s\npassword=%s\n' "$username" "$password" | sudo tee "$CREDS_PATH" >/dev/null

echo "Synced NAS SMB credentials into $CREDS_PATH"
