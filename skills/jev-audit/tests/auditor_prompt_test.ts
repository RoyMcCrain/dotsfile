import assert from "node:assert/strict";
import { REVIEW_CRITERIA } from "../../parallel-review/scripts/select_review_level.ts";
import {
  buildAuditorSystemPrompt,
  buildAuditorUserPrompt,
} from "../scripts/auditor_prompt.ts";

Deno.test("blind prompt includes rubric without Jev metadata", () => {
  const user = buildAuditorUserPrompt();
  const system = buildAuditorSystemPrompt();
  assert.match(user, /Level 1:/);
  assert.equal(user.includes(REVIEW_CRITERIA["5"]), true);
  assert.equal(user.includes("suggestedLevel"), false);
  assert.equal(user.includes("confidence"), false);
  assert.equal(user.includes("runId"), false);
  assert.equal(system.includes("Jev"), false);
});
