import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("conversations list route does not import Graph API or channel adapters", () => {
  const route = readFileSync(new URL("../../../app/api/conversations/route.ts", import.meta.url), "utf8");
  const enrich = readFileSync(
    new URL("../../application/sourcePost/enrichConversationListSourcePostText.ts", import.meta.url),
    "utf8"
  );
  for (const source of [route, enrich]) {
    assert.equal(source.includes("graph.facebook.com"), false);
    assert.equal(source.includes("FacebookAdapter"), false);
    assert.equal(source.includes("InstagramAdapter"), false);
    assert.equal(source.includes("fetchCommentDetailFromGraph"), false);
  }
});
