import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeProviderErrorMessage } from "./sanitizeProviderError.js";

test("sanitizeProviderErrorMessage redacts Meta-style tokens", () => {
  const msg = sanitizeProviderErrorMessage("Invalid OAuth access token EAAG1234567890abcdef0123456789");
  assert.equal(msg.includes("EAAG"), false);
  assert.match(msg, /\[redacted\]/);
});

test("sanitizeProviderErrorMessage redacts Bearer tokens", () => {
  const msg = sanitizeProviderErrorMessage("Auth failed Bearer abc.def.ghi");
  assert.equal(msg.includes("abc.def.ghi"), false);
});
