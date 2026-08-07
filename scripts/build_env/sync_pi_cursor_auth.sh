#!/usr/bin/env bash
# Sync Cursor Agent CLI / Desktop Keychain tokens into ~/.pi/agent/auth.json
# so @rahularya01/pi-cursor can mark the cursor provider as configured.
set -euo pipefail

AUTH_PATH="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/auth.json"
ACCOUNT="${CURSOR_KEYCHAIN_ACCOUNT:-cursor-user}"

if ! command -v security >/dev/null 2>&1; then
	echo "macOS Keychain (security) is required" >&2
	exit 1
fi

access="$(security find-generic-password -w -s cursor-access-token -a "$ACCOUNT" 2>/dev/null || true)"
refresh="$(security find-generic-password -w -s cursor-refresh-token -a "$ACCOUNT" 2>/dev/null || true)"

if [[ -z "$access" || -z "$refresh" ]]; then
	echo "Cursor Keychain tokens not found (cursor-access-token / cursor-refresh-token)." >&2
	echo "Log in with: agent login" >&2
	echo "Or in pi: /login cursor" >&2
	exit 1
fi

mkdir -p "$(dirname "$AUTH_PATH")"
umask 077
AUTH_PATH="$AUTH_PATH" ACCESS="$access" REFRESH="$refresh" python3 - <<'PY'
import json, os, base64, time
from pathlib import Path

path = Path(os.environ["AUTH_PATH"])
access = os.environ["ACCESS"]
refresh = os.environ["REFRESH"]

def jwt_exp_ms(token: str) -> int:
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload.encode()))
        exp = data.get("exp")
        if isinstance(exp, (int, float)):
            return int(exp * 1000)
    except Exception:
        pass
    return int(time.time() * 1000) + 24 * 3600 * 1000

auth = {}
if path.exists():
    auth = json.loads(path.read_text())

auth["cursor"] = {
    "type": "oauth",
    "access": access,
    "refresh": refresh,
    "expires": jwt_exp_ms(access),
}

path.write_text(json.dumps(auth, indent=2) + "\n")
path.chmod(0o600)
print(f"Synced Cursor OAuth credentials into {path}")
PY
