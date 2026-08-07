#!/usr/bin/env bash
# Sync Claude Code Keychain OAuth tokens into ~/.pi/agent/auth.json
# so Pi's built-in Anthropic (Claude Pro/Max) provider is configured.
set -euo pipefail

AUTH_PATH="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/auth.json"
KEYCHAIN_SERVICE="${CLAUDE_CODE_KEYCHAIN_SERVICE:-Claude Code-credentials}"

if ! command -v security >/dev/null 2>&1; then
	echo "macOS Keychain (security) is required" >&2
	exit 1
fi

raw="$(security find-generic-password -w -s "$KEYCHAIN_SERVICE" 2>/dev/null || true)"
if [[ -z "$raw" ]]; then
	echo "Claude Code Keychain item not found ($KEYCHAIN_SERVICE)." >&2
	echo "Log in with Claude Code, or in pi: /login  →  Anthropic (Claude Pro/Max)" >&2
	exit 1
fi

mkdir -p "$(dirname "$AUTH_PATH")"
umask 077
AUTH_PATH="$AUTH_PATH" RAW="$raw" python3 - <<'PY'
import json, os, sys, time
from pathlib import Path

path = Path(os.environ["AUTH_PATH"])
try:
    data = json.loads(os.environ["RAW"])
except json.JSONDecodeError as e:
    print(f"Claude Code credentials are not valid JSON: {e}", file=sys.stderr)
    sys.exit(1)

oauth = data.get("claudeAiOauth")
if not isinstance(oauth, dict):
    print("Claude Code credentials have no claudeAiOauth entry.", file=sys.stderr)
    print("Log in with Claude Code, or in pi: /login  →  Anthropic (Claude Pro/Max)", file=sys.stderr)
    sys.exit(1)

access = oauth.get("accessToken") or ""
refresh = oauth.get("refreshToken") or ""
expires = oauth.get("expiresAt")
refresh_expires = oauth.get("refreshTokenExpiresAt")

if not access or not refresh:
    print("Claude Code OAuth tokens are missing or cleared.", file=sys.stderr)
    print("Re-login with Claude Code, or in pi: /login  →  Anthropic (Claude Pro/Max)", file=sys.stderr)
    sys.exit(1)

now_ms = int(time.time() * 1000)
if isinstance(refresh_expires, (int, float)) and refresh_expires <= now_ms:
    print("Claude Code refresh token is expired.", file=sys.stderr)
    print("Re-login with Claude Code, or in pi: /login  →  Anthropic (Claude Pro/Max)", file=sys.stderr)
    sys.exit(1)

if not isinstance(expires, (int, float)):
    expires = now_ms + 24 * 3600 * 1000

auth = {}
if path.exists():
    auth = json.loads(path.read_text())

entry = {
    "type": "oauth",
    "access": access,
    "refresh": refresh,
    "expires": int(expires),
}
if isinstance(oauth.get("scopes"), list):
    entry["scopes"] = oauth["scopes"]
if oauth.get("subscriptionType"):
    entry["subscriptionType"] = oauth["subscriptionType"]

auth["anthropic"] = entry
path.write_text(json.dumps(auth, indent=2) + "\n")
path.chmod(0o600)

age_h = (expires - now_ms) / 3600
print(f"Synced Claude Pro/Max OAuth credentials into {path}")
print(f"access token expires in {age_h:.1f}h (subscription={entry.get('subscriptionType', '?')})")
if age_h < 0:
    print("Note: access token is expired; Pi will refresh it on first use.")
PY
