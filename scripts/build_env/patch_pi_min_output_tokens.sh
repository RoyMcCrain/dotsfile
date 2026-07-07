#!/usr/bin/env bash
set -euo pipefail

PI_SIMPLE_OPTIONS="$(npm root -g)/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/api/simple-options.js"

if [[ ! -f "$PI_SIMPLE_OPTIONS" ]]; then
	echo "Pi simple-options.js not found: $PI_SIMPLE_OPTIONS" >&2
	exit 1
fi

node - "$PI_SIMPLE_OPTIONS" <<'NODE'
const fs = require("node:fs");

const file = process.argv[2];
const source = fs.readFileSync(file, "utf8");
const patched = source.replace(
  /const MIN_MAX_TOKENS = \d+;/,
  "const MIN_MAX_TOKENS = 16;",
);

if (patched === source && !source.includes("const MIN_MAX_TOKENS = 16;")) {
  throw new Error(`MIN_MAX_TOKENS declaration not found in ${file}`);
}

if (patched !== source) {
  fs.writeFileSync(file, patched, "utf8");
}

console.log(`Patched Pi minimum max tokens: ${file}`);
NODE
