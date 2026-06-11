import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("conversations list route bridges persisted metadata without Graph list-time enrichment", () => {
  const route = readFileSync(new URL("../../../app/api/conversations/route.ts", import.meta.url), "utf8");
  assert.equal(route.includes("enrichConversationListSourcePostText"), false);
  assert.equal(route.includes("graph.facebook.com"), false);
  assert.match(route, /loadSourcePostMetadataForConversationListRows/);
});

test("source post sanitizer lib does not import domain sourcePostContext", () => {
  const sanitize = readFileSync(
    new URL("../../lib/sourcePostSnippetSanitize.ts", import.meta.url),
    "utf8"
  );
  const metadata = readFileSync(new URL("../../lib/sourcePostContextMetadata.ts", import.meta.url), "utf8");
  assert.equal(sanitize.includes("sourcePostContext"), false);
  assert.equal(metadata.includes("sourcePostContext"), false);
});

test("domain sourcePostContext imports sanitizer lib one-way only", () => {
  const domain = readFileSync(new URL("../../domain/sourcePostContext.ts", import.meta.url), "utf8");
  assert.match(domain, /sourcePostSnippetSanitize/);
  const lib = readFileSync(new URL("../../lib/sourcePostSnippetSanitize.ts", import.meta.url), "utf8");
  assert.equal(lib.includes("sourcePostContext"), false);
});
