import test from "node:test";
import assert from "node:assert/strict";
import { buildEventCounts, createDefaultProfile } from "./scenarios.js";

test("loadtest scenario sanity checks", () => {
  const profile = createDefaultProfile();
  const counts = buildEventCounts(profile);
  assert.equal(counts.inboundBurstEvents, 300);
  assert.equal(counts.outboundSustainedEvents, 12000);
  assert.equal(counts.duplicateInbound > 0, true);
  assert.equal(counts.duplicateOutbound > 0, true);
});
