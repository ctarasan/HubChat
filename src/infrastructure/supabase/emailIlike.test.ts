import test from "node:test";
import assert from "node:assert/strict";
import { emailForExactIlike, normalizeEmailForStorage } from "./emailIlike.js";

test("normalizeEmailForStorage lowercases and trims", () => {
  assert.equal(normalizeEmailForStorage("  SM001@B-CONNEX.NET  "), "sm001@b-connex.net");
});

test("emailForExactIlike escapes ilike metacharacters", () => {
  assert.equal(emailForExactIlike("a%b_c\\d@test.com"), "a\\%b\\_c\\\\d@test.com");
});
