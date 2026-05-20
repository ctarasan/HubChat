import test from "node:test";
import assert from "node:assert/strict";
import {
  buildListResponseCostReport,
  classifyPayloadCostTier,
  estimateUtf8JsonBytes
} from "./responseCostEstimate.js";

test("estimateUtf8JsonBytes returns positive size for objects", () => {
  const n = estimateUtf8JsonBytes({ data: [{ id: "x".repeat(100) }] });
  assert.ok(n > 100);
});

test("classifyPayloadCostTier buckets by byte thresholds", () => {
  assert.equal(classifyPayloadCostTier(1000), "low");
  assert.equal(classifyPayloadCostTier(60_000), "medium");
  assert.equal(classifyPayloadCostTier(250_000), "high");
  assert.equal(classifyPayloadCostTier(600_000), "very_high");
});

test("buildListResponseCostReport includes route and tier", () => {
  const report = buildListResponseCostReport({
    route: "hubchat.test.list",
    itemCount: 2,
    limit: 25,
    hasCursor: true,
    responseBody: { data: [{ id: "a" }, { id: "b" }], pageInfo: { nextCursor: "c" } }
  });
  assert.equal(report.route, "hubchat.test.list");
  assert.equal(report.itemCount, 2);
  assert.equal(report.limit, 25);
  assert.equal(report.hasCursor, true);
  assert.ok(report.estimatedUtf8Bytes > 0);
  assert.equal(report.tier, "low");
});
