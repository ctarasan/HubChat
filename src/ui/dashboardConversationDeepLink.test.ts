import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeConversationRowsWithDeepLinkRow,
  readDashboardConversationDeepLink,
  stripDashboardConversationDeepLink
} from "./dashboardConversationDeepLink.js";

const VALID_ID = "0f1e2d3c-4b5a-4978-a123-456789abcdef";

test("readDashboardConversationDeepLink accepts a valid conversation uuid", () => {
  assert.equal(readDashboardConversationDeepLink(`?conversationId=${VALID_ID}`), VALID_ID);
  assert.equal(readDashboardConversationDeepLink(`conversationId=${VALID_ID}`), VALID_ID);
});

test("readDashboardConversationDeepLink trims surrounding whitespace", () => {
  assert.equal(
    readDashboardConversationDeepLink(`?conversationId=%20${VALID_ID}%20`),
    VALID_ID
  );
});

test("readDashboardConversationDeepLink keeps other params out of the result", () => {
  assert.equal(
    readDashboardConversationDeepLink(`?foo=bar&conversationId=${VALID_ID}&baz=1`),
    VALID_ID
  );
});

test("readDashboardConversationDeepLink returns null when param is missing or empty", () => {
  assert.equal(readDashboardConversationDeepLink(undefined), null);
  assert.equal(readDashboardConversationDeepLink(null), null);
  assert.equal(readDashboardConversationDeepLink(""), null);
  assert.equal(readDashboardConversationDeepLink("?"), null);
  assert.equal(readDashboardConversationDeepLink("?conversationId="), null);
  assert.equal(readDashboardConversationDeepLink("?foo=bar"), null);
});

test("readDashboardConversationDeepLink rejects malformed values", () => {
  const malformed = [
    "conv-1",
    "not-a-uuid",
    "123",
    `${VALID_ID}x`,
    `${VALID_ID.slice(0, 35)}`,
    "javascript:alert(1)",
    "../../etc/passwd",
    encodeURIComponent("0f1e2d3c-4b5a-4978-a123-456789abcdef OR 1=1")
  ];
  for (const value of malformed) {
    assert.equal(
      readDashboardConversationDeepLink(`?conversationId=${value}`),
      null,
      `expected null for ${value}`
    );
  }
});

test("readDashboardConversationDeepLink does not select by customer name params", () => {
  assert.equal(readDashboardConversationDeepLink("?customerName=Alice"), null);
  assert.equal(readDashboardConversationDeepLink("?displayName=Alice"), null);
});

test("stripDashboardConversationDeepLink removes only the deep-link param", () => {
  assert.equal(
    stripDashboardConversationDeepLink("/dashboard", `?conversationId=${VALID_ID}`),
    "/dashboard"
  );
  assert.equal(
    stripDashboardConversationDeepLink("/dashboard", `?foo=bar&conversationId=${VALID_ID}`),
    "/dashboard?foo=bar"
  );
  assert.equal(stripDashboardConversationDeepLink("/dashboard", ""), "/dashboard");
  assert.equal(stripDashboardConversationDeepLink("/dashboard", "?foo=bar"), "/dashboard?foo=bar");
});

test("mergeConversationRowsWithDeepLinkRow appends when row is missing", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  const merged = mergeConversationRowsWithDeepLinkRow(rows, { id: "c" });
  assert.deepEqual(
    merged.map((r) => r.id),
    ["a", "b", "c"]
  );
  assert.notEqual(merged, rows);
});

test("mergeConversationRowsWithDeepLinkRow keeps rows untouched when present or null", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  assert.equal(mergeConversationRowsWithDeepLinkRow(rows, { id: "b" }), rows);
  assert.equal(mergeConversationRowsWithDeepLinkRow(rows, null), rows);
  assert.equal(mergeConversationRowsWithDeepLinkRow(rows, undefined), rows);
});
