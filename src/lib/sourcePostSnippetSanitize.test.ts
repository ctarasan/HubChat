import test from "node:test";
import assert from "node:assert/strict";
import { SOURCE_POST_SNIPPET_MAX_LENGTH, sanitizeSourcePostSnippet } from "./sourcePostSnippetSanitize.js";

test("sanitizeSourcePostSnippet returns capped safe parent post text", () => {
  const snippet = sanitizeSourcePostSnippet("  Summer sale on all items  ");
  assert.equal(snippet, "Summer sale on all items");
});

test("sanitizeSourcePostSnippet truncates long text safely", () => {
  const long = "a".repeat(SOURCE_POST_SNIPPET_MAX_LENGTH + 40);
  const snippet = sanitizeSourcePostSnippet(long);
  assert.ok(snippet);
  assert.ok(snippet!.length <= SOURCE_POST_SNIPPET_MAX_LENGTH + 1);
});

test("sanitizeSourcePostSnippet rejects JSON-looking strings", () => {
  assert.equal(sanitizeSourcePostSnippet('{"message":"hidden"}'), null);
});

test("sanitizeSourcePostSnippet rejects URL-only strings", () => {
  assert.equal(sanitizeSourcePostSnippet("https://www.facebook.com/permalink.php"), null);
});

test("sanitizeSourcePostSnippet rejects token-like strings", () => {
  assert.equal(sanitizeSourcePostSnippet("EAAGm0PX4ZCpsBADefghijklmnopqrstuvwxyz"), null);
});

test("sanitizeSourcePostSnippet rejects provider ID-like strings", () => {
  assert.equal(sanitizeSourcePostSnippet("122105157068693891_1379551257551517"), null);
  assert.equal(sanitizeSourcePostSnippet("comment:122105157068693891_1379551257551517"), null);
});

test("sanitizeSourcePostSnippet rejects non-string values", () => {
  assert.equal(sanitizeSourcePostSnippet({ text: "nope" }), null);
});
