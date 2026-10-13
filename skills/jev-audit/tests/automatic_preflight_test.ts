import assert from "node:assert/strict";
import { automaticPreflight } from "../scripts/automatic_preflight.ts";

const scan = (text: string) =>
  automaticPreflight(new TextEncoder().encode(text));

Deno.test("automatic preflight holds common credentials and personal data", () => {
  const unsafe = [
    "AKIA1234567890ABCDEF",
    "AIzaSyD123456789012345678901234567890123",
    // Keep this synthetic token from triggering GitHub push protection.
    "xoxb-" + "123456789012-abcdefghijklmnop",
    "postgres://alice:secret123@db.example.net/app",
    'const accountKey = "abcdefghijklmnopqrstuvwxyz123456";',
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
    "eyJabcdefghijk.abcdefghijk.abcdefghijk",
    'const secret = "live-value-not-for-upload";',
    "contact alice.private@gmail.com",
    "call me at +1 (415) 555-0199",
    "15 Main Street",
  ];
  for (const value of unsafe) assert.throws(() => scan(value));
});

Deno.test("automatic preflight allows empty credential literals", () => {
  scan('{"token":"","password":""}');
});

Deno.test("automatic preflight scans quoted fields and every credential match", () => {
  for (
    const value of [
      '{"api_key":"live-value-not-for-upload"}',
      '{"client_secret":"live-value-not-for-upload"}',
      'const harmless = "AKIAIOSFODNN7EXAMPLE"; const key = "AKIA1234567890ABCDEF";',
      "const connection = AccountKey=abcdefghijklmnopqrstuvwxyz123456;",
      'const key = "ASIA1234567890ABCDEF";',
      '{"phone":"+81 90-1234-5678","firstName":"Alice"}',
      'const customer = { "addressLine": "12 Oak Street", "postalCode": "12345" };',
    ]
  ) assert.throws(() => scan(value));
});

Deno.test("automatic preflight does not treat dates or syntax as phone numbers", () => {
  scan(
    'const date = "2026-10-13"; const id = "123456789012"; handler(400); const ratio = 4 / 400;',
  );
  scan('const note = "+1 "; const status = "(400)";');
});

Deno.test("automatic preflight catches one-character and quoted surname values", () => {
  assert.throws(() => scan(`{ "lastName": "O'Neil" }`));
  assert.throws(() => scan('{"firstName":"李"}'));
});

Deno.test("automatic preflight accepts dummy contacts and env references", () => {
  scan(
    'contact developer@example.com and qa@sample.test; const key = Deno.env.get("API_KEY"); https://example.org/path',
  );
  scan('const api_key = "test"; const token = "mock"; AKIAIOSFODNN7EXAMPLE');
});
