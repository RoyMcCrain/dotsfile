#!/usr/bin/env bash
# Install kouvaliasnick/pi-cursor@fix/goaway-after-turn-ended and build dist.
# Upstream npm 1.4.8 still surfaces post-turnEnded GOAWAY as an error; PR #4 silences it.
# pi's git installer runs `npm install --omit=dev`, which cannot run `prepare`/`tsup`,
# so this script builds dist with full deps after clone/fetch.
set -euo pipefail

REF="${PI_CURSOR_GOAWAY_FIX_REF:-fix/goaway-after-turn-ended}"
REPO_URL="${PI_CURSOR_GOAWAY_FIX_REPO:-https://github.com/kouvaliasnick/pi-cursor.git}"
TARGET="${PI_CURSOR_GOAWAY_FIX_DIR:-$HOME/.pi/agent/git/github.com/kouvaliasnick/pi-cursor}"
SETTINGS_SOURCE="git:github.com/kouvaliasnick/pi-cursor@${REF}"

mkdir -p "$(dirname "$TARGET")"

if [[ ! -d "$TARGET/.git" ]]; then
	git clone --depth 1 -b "$REF" "$REPO_URL" "$TARGET"
else
	git -C "$TARGET" remote set-url origin "$REPO_URL"
	git -C "$TARGET" fetch --depth 1 origin "$REF"
	git -C "$TARGET" checkout -B "$REF" "FETCH_HEAD"
fi

# Full install so tsup is available for build; dist/ is gitignored.
npm install --prefix "$TARGET"
npm run --prefix "$TARGET" build

# Runtime deps only for day-to-day loads (keeps the tree closer to pi's installer).
npm install --prefix "$TARGET" --omit=dev --ignore-scripts

if [[ ! -f "$TARGET/dist/index.js" ]]; then
	echo "pi-cursor GOAWAY fix build failed: missing $TARGET/dist/index.js" >&2
	exit 1
fi

if ! grep -q 'goaway_after_turn_ended' "$TARGET/dist/index.js"; then
	echo "pi-cursor GOAWAY fix build missing goaway_after_turn_ended handler" >&2
	exit 1
fi

echo "Installed $SETTINGS_SOURCE"
echo "Built: $TARGET/dist/index.js"
echo "Restart pi (or /reload) to pick up the provider."
