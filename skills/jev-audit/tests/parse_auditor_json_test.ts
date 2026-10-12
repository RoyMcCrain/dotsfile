import assert from "node:assert/strict";
import { parseAuditorResponse } from "../scripts/parse_auditor_json.ts";

Deno.test("schema rejects invalid auditor JSON", () => {
  assert.throws(() => parseAuditorResponse("not json"), /JSON/);
  assert.throws(
    () =>
      parseAuditorResponse(
        '{"minLevel":3,"maxLevel":2,"reason":"x","concerns":[]}',
      ),
    /minLevel/,
  );
  assert.throws(
    () =>
      parseAuditorResponse(
        '{"minLevel":3,"maxLevel":4,"reason":"","concerns":[]}',
      ),
    /reason/,
  );
});

Deno.test("accepts fenced JSON block", () => {
  const raw =
    '```json\n{"minLevel":2,"maxLevel":4,"reason":"ok","concerns":["a"]}\n```';
  const parsed = parseAuditorResponse(raw);
  assert.equal(parsed.minLevel, 2);
  assert.equal(parsed.maxLevel, 4);
  assert.throws(() => parseAuditorResponse(`prose\n${raw}`), /JSON/);
  assert.throws(() => parseAuditorResponse(`${raw}\n${raw}`), /JSON/);
});
